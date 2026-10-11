import { Router, type Request, type Response } from "express";
import { and, eq, or, sql } from "drizzle-orm";
import { db, merchantsTable } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { requirePermission } from "../lib/tenant-access";
import { emitDomainEvent } from "../lib/domain-events";
import { currencyMinorDigits, toMinorUnits } from "../lib/money";
import {
  calculateSupplierQuoteTotalMinor,
  hashSupplierQuotePortalToken,
  issueSupplierQuotePortalToken,
  resolveSupplierQuotePortalBaseUrl,
  supplierQuotePortalUrl,
  SUPPLIER_QUOTE_PORTAL_TTL_MS,
} from "../lib/supplier-quote-portal";

const router = Router();
type Row = Record<string, unknown>;

function isRecord(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value: unknown, max: number): string | null | false {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return normalized.length <= max && !normalized.includes(String.fromCharCode(0)) ? (normalized || null) : false;
}

function positiveInteger(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function publicEvidenceUrl(value: unknown): string | null | false {
  const normalized = boundedText(value, 2048);
  if (normalized === false || normalized === null) return normalized;
  try {
    const url = new URL(normalized);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return false;
    return url.toString();
  } catch {
    return false;
  }
}

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
}

async function merchantFor(req: Request, res: Response) {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const [merchant] = await db.select({ id: merchantsTable.id })
    .from(merchantsTable)
    .where(and(
      eq(merchantsTable.status, "active"),
      or(eq(merchantsTable.localAuthUserId, userId), eq(merchantsTable.clerkUserId, userId)),
    ))
    .limit(1);
  if (!merchant) {
    res.status(404).json({ error: "Merchant workspace not found" });
    return null;
  }
  try {
    await requirePermission(userId, merchant.id, "fulfillment.manage");
  } catch {
    res.status(403).json({ error: "Permission required: fulfillment.manage" });
    return null;
  }
  return { merchantId: merchant.id, userId };
}

function tokenDigest(req: Request): string | null {
  return hashSupplierQuotePortalToken(req.params.token);
}

/**
 * Issue an expiring one-time response link. The plain token is returned to the
 * authorized merchant only once; only its SHA-256 digest is persisted.
 */
router.post("/merchant/dropship/workbench/quotes/:id/portal", async (req, res, next) => {
  try {
    noStore(res);
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      res.status(400).json({ error: "Invalid supplier quote request id" });
      return;
    }

    let baseUrl: URL;
    try {
      baseUrl = resolveSupplierQuotePortalBaseUrl();
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : "Public app URL is not configured" });
      return;
    }

    const issued = issueSupplierQuotePortalToken();
    const expiresAt = new Date(Date.now() + SUPPLIER_QUOTE_PORTAL_TTL_MS);
    const portalUrl = supplierQuotePortalUrl(baseUrl, issued.token);
    const result = await db.transaction(async (tx) => {
      const selected = await tx.execute(sql`
        SELECT id, merchant_id, status
        FROM dropship_supplier_quote_requests
        WHERE id = ${id}::uuid AND merchant_id = ${ctx.merchantId}
        LIMIT 1 FOR UPDATE
      `);
      const current = (selected.rows[0] as Row | undefined) ?? null;
      if (!current) return { kind: "not_found" as const };
      if (current.status !== "draft") return { kind: "not_draft" as const };

      const update = await tx.execute(sql`
        UPDATE dropship_supplier_quote_requests
        SET portal_token_hash = ${issued.tokenHash},
            portal_token_expires_at = ${expiresAt},
            portal_token_issued_at = now(),
            portal_token_used_at = NULL,
            portal_token_revoked_at = NULL,
            evidence = COALESCE(evidence, '{}'::jsonb) || ${JSON.stringify({
              supplierQuotePortal: {
                deliveryMode: "merchant_share_link",
                externalMessageSent: false,
                expiresAt: expiresAt.toISOString(),
              },
            })}::jsonb,
            updated_at = now()
        WHERE id = ${id}::uuid
          AND merchant_id = ${ctx.merchantId}
          AND status = 'draft'
        RETURNING id, status, portal_token_expires_at
      `);
      const row = (update.rows[0] as Row | undefined) ?? null;
      if (!row) return { kind: "changed" as const };

      await emitDomainEvent(tx, {
        merchantId: ctx.merchantId,
        eventType: "supplier.quote.portal_issued",
        aggregateType: "dropship_supplier_quote_request",
        aggregateId: id,
        actorType: "merchant",
        actorId: ctx.userId,
        source: "merchant_api",
        idempotencyKey: "supplier-quote-portal-issued:" + id + ":" + issued.tokenHash.slice(0, 16),
        payload: {
          quoteRequestId: id,
          expiresAt: expiresAt.toISOString(),
          deliveryMode: "merchant_share_link",
          externalMessageSent: false,
        },
      });
      return { kind: "ok" as const };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Supplier quote request not found" });
      return;
    }
    if (result.kind === "not_draft") {
      res.status(409).json({ error: "Only a draft supplier request can receive a new response link" });
      return;
    }
    if (result.kind === "changed") {
      res.status(409).json({ error: "The supplier request changed concurrently. Reload and retry." });
      return;
    }
    res.status(201).json({
      quoteRequestId: id,
      shareUrl: portalUrl,
      expiresAt: expiresAt.toISOString(),
      deliveryMode: "merchant_share_link",
      externalMessageSent: false,
      tokenStoredAs: "sha256_digest_only",
      note: "Copy and send this link to the supplier. Lunavo has not emailed or messaged the supplier.",
    });
  } catch (error) {
    next(error);
  }
});

/** Revoke an outstanding link immediately; issuing a new one also invalidates the old digest. */
router.delete("/merchant/dropship/workbench/quotes/:id/portal", async (req, res, next) => {
  try {
    noStore(res);
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      res.status(400).json({ error: "Invalid supplier quote request id" });
      return;
    }
    const revoked = await db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        UPDATE dropship_supplier_quote_requests
        SET portal_token_revoked_at = now(), updated_at = now()
        WHERE id = ${id}::uuid AND merchant_id = ${ctx.merchantId}
          AND portal_token_hash IS NOT NULL
          AND portal_token_used_at IS NULL
          AND portal_token_revoked_at IS NULL
        RETURNING id
      `);
      if (result.rowCount !== 1) return false;
      await emitDomainEvent(tx, {
        merchantId: ctx.merchantId,
        eventType: "merchant.operation.transitioned",
        aggregateType: "dropship_supplier_quote_request",
        aggregateId: id,
        actorType: "merchant",
        actorId: ctx.userId,
        source: "merchant_api",
        idempotencyKey: "supplier-quote-portal-revoked:" + id,
        payload: { quoteRequestId: id, action: "portal_link_revoked" },
      });
      return true;
    });
    if (!revoked) {
      res.status(409).json({ error: "No unused supplier response link is available to revoke" });
      return;
    }
    res.json({ revoked: true, quoteRequestId: id });
  } catch (error) {
    next(error);
  }
});

/** Public read is token-gated and deliberately omits tenant identifiers and internal evidence. */
router.get("/public/supplier-quote/:token", async (req, res, next) => {
  try {
    noStore(res);
    const hash = tokenDigest(req);
    if (!hash) {
      res.status(404).json({ error: "This supplier response link is invalid or no longer available" });
      return;
    }
    const result = await db.execute(sql`
      SELECT id, supplier_name, product_title, sku, destination_country, currency,
             quantity, target_unit_price_minor, desired_delivery_days, request_notes,
             portal_token_expires_at
      FROM dropship_supplier_quote_requests
      WHERE portal_token_hash = ${hash}
        AND status = 'draft'
        AND portal_token_used_at IS NULL
        AND portal_token_revoked_at IS NULL
        AND portal_token_expires_at > now()
      LIMIT 1
    `);
    const row = (result.rows[0] as Row | undefined) ?? null;
    if (!row) {
      res.status(404).json({ error: "This supplier response link is invalid or no longer available" });
      return;
    }
    const currency = String(row.currency);
    res.json({
      quoteRequest: {
        id: String(row.id),
        supplierName: row.supplier_name == null ? null : String(row.supplier_name),
        productTitle: String(row.product_title),
        sku: row.sku == null ? null : String(row.sku),
        destinationCountry: String(row.destination_country),
        currency,
        currencyMinorDigits: currencyMinorDigits(currency),
        quantity: Number(row.quantity),
        targetUnitPriceMinor: row.target_unit_price_minor == null ? null : Number(row.target_unit_price_minor),
        desiredDeliveryDays: row.desired_delivery_days == null ? null : Number(row.desired_delivery_days),
        requestNotes: row.request_notes == null ? null : String(row.request_notes),
        expiresAt: row.portal_token_expires_at instanceof Date
          ? row.portal_token_expires_at.toISOString()
          : new Date(String(row.portal_token_expires_at)).toISOString(),
      },
      submission: "one_time_supplier_response",
    });
  } catch (error) {
    next(error);
  }
});

/** The response and one-time token consumption commit atomically with the domain event. */
router.post("/public/supplier-quote/:token", async (req, res, next) => {
  try {
    noStore(res);
    const hash = tokenDigest(req);
    if (!hash) {
      res.status(404).json({ error: "This supplier response link is invalid or no longer available" });
      return;
    }
    const body = isRecord(req.body) ? req.body : {};
    const unitText = boundedText(body.quotedUnitPrice, 80);
    const shippingText = boundedText(body.quotedShipping ?? "0", 80);
    const notes = boundedText(body.quoteNotes, 3000);
    const evidenceUrl = publicEvidenceUrl(body.quoteEvidenceUrl);
    const eta = positiveInteger(body.quotedDeliveryDays, 1, 365);
    const expiryText = boundedText(body.quoteExpiresAt, 80);
    if (unitText === false || unitText === null || shippingText === false || shippingText === null ||
        notes === false || evidenceUrl === false || expiryText === false || eta === null) {
      res.status(400).json({ error: "Enter a valid unit price, shipping amount and delivery estimate" });
      return;
    }
    let offerExpiresAt: Date | null = null;
    if (expiryText) {
      const timestamp = Date.parse(expiryText);
      if (!Number.isFinite(timestamp) || timestamp <= Date.now() || timestamp > Date.now() + 366 * 24 * 60 * 60 * 1000) {
        res.status(400).json({ error: "Offer expiry must be a valid future date within 366 days" });
        return;
      }
      offerExpiresAt = new Date(timestamp);
    }

    const outcome = await db.transaction(async (tx) => {
      const selected = await tx.execute(sql`
        SELECT id, merchant_id, status, quantity, currency,
               portal_token_expires_at, portal_token_used_at, portal_token_revoked_at
        FROM dropship_supplier_quote_requests
        WHERE portal_token_hash = ${hash}
        LIMIT 1 FOR UPDATE
      `);
      const current = (selected.rows[0] as Row | undefined) ?? null;
      if (!current) return { kind: "missing" as const };
      if (current.portal_token_used_at) return { kind: "used" as const };
      if (current.portal_token_revoked_at) return { kind: "revoked" as const };
      const linkExpiry = current.portal_token_expires_at instanceof Date
        ? current.portal_token_expires_at.getTime()
        : Date.parse(String(current.portal_token_expires_at ?? ""));
      if (!Number.isFinite(linkExpiry) || linkExpiry <= Date.now()) return { kind: "expired" as const };
      if (current.status !== "draft") return { kind: "not_draft" as const };

      const quantity = Number(current.quantity);
      const currency = String(current.currency);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000 || !/^[A-Z]{3}$/.test(currency)) {
        throw new Error("Stored supplier quote request failed validation");
      }
      const digits = currencyMinorDigits(currency);
      const unitMinor = toMinorUnits(unitText, digits);
      const shippingMinor = toMinorUnits(shippingText, digits);
      if (unitMinor === null || unitMinor <= 0 || shippingMinor === null || shippingMinor < 0) {
        return { kind: "bad_money" as const };
      }
      const totalMinor = calculateSupplierQuoteTotalMinor(unitMinor, quantity, shippingMinor);
      if (totalMinor === null) return { kind: "overflow" as const };
      const nowIso = new Date().toISOString();
      const portalEvidence = {
        supplierPortalResponse: {
          method: "tokenized_supplier_share_link",
          submittedAt: nowIso,
          evidenceUrl,
          supplierNotes: notes,
          externalDispatch: "merchant_shared_link",
        },
      };
      const updated = await tx.execute(sql`
        UPDATE dropship_supplier_quote_requests
        SET status = 'quoted',
            quoted_unit_price_minor = ${unitMinor},
            quoted_shipping_minor = ${shippingMinor},
            quoted_total_minor = ${totalMinor},
            quoted_delivery_days = ${eta},
            quote_expires_at = ${offerExpiresAt},
            quote_notes = ${notes},
            evidence = COALESCE(evidence, '{}'::jsonb) || ${JSON.stringify(portalEvidence)}::jsonb,
            portal_token_used_at = now(),
            updated_by = 'supplier_quote_portal',
            updated_at = now()
        WHERE id = ${String(current.id)}::uuid
          AND merchant_id = ${Number(current.merchant_id)}
          AND status = 'draft'
          AND portal_token_hash = ${hash}
          AND portal_token_used_at IS NULL
          AND portal_token_revoked_at IS NULL
          AND portal_token_expires_at > now()
        RETURNING id, merchant_id, status, quoted_total_minor, currency, quoted_delivery_days
      `);
      const row = (updated.rows[0] as Row | undefined) ?? null;
      if (!row) return { kind: "changed" as const };

      await emitDomainEvent(tx, {
        merchantId: Number(row.merchant_id),
        eventType: "supplier.quote.received",
        aggregateType: "dropship_supplier_quote_request",
        aggregateId: String(row.id),
        actorType: "system",
        actorId: null,
        source: "system",
        idempotencyKey: "supplier-quote-received:" + String(row.id),
        payload: {
          quoteRequestId: String(row.id),
          status: "quoted",
          currency: String(row.currency),
          quotedTotalMinor: Number(row.quoted_total_minor),
          quotedDeliveryDays: Number(row.quoted_delivery_days),
          submissionMethod: "tokenized_supplier_share_link",
        },
      });
      return { kind: "ok" as const, quoteRequestId: String(row.id) };
    });

    const errors: Record<string, { status: number; message: string }> = {
      missing: { status: 404, message: "This supplier response link is invalid or no longer available" },
      used: { status: 409, message: "This supplier response link has already been used" },
      revoked: { status: 410, message: "This supplier response link has been revoked" },
      expired: { status: 410, message: "This supplier response link has expired" },
      not_draft: { status: 409, message: "This supplier request is no longer accepting an offer" },
      bad_money: { status: 400, message: "Use a positive unit price and a non-negative shipping amount in the requested currency" },
      overflow: { status: 400, message: "Offer total exceeds the supported exact-integer range" },
      changed: { status: 409, message: "The supplier request changed concurrently. Reload and try again." },
    };
    if (outcome.kind !== "ok") {
      const problem = errors[outcome.kind];
      res.status(problem.status).json({ error: problem.message });
      return;
    }
    res.status(201).json({
      submitted: true,
      quoteRequestId: outcome.quoteRequestId,
      status: "quoted",
      nextStep: "The merchant can review the supplier offer and accept or reject it from the dropshipping workbench.",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
