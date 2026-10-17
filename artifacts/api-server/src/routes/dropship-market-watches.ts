import { Router, type Request, type Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, or, sql } from "drizzle-orm";
import { db, merchantsTable, supplierProductsTable } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { emitDomainEvent } from "../lib/domain-events";
import { requirePermission } from "../lib/tenant-access";
import { importPublicSupplierProduct } from "../lib/public-supplier";
import { buildPublicMarketObservation } from "../lib/public-market-observation";
import { recordMarketResearch } from "../lib/dropship-intelligence";
import {
  isValidMarketWatchInterval,
  MAX_MARKET_WATCHES_PER_MERCHANT,
} from "../lib/dropship-market-watch-policy";

const router = Router();

class MarketWatchLimitError extends Error {}

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
    await requirePermission(userId, merchant.id, "ai.execute");
  } catch {
    res.status(403).json({ error: "Dropship intelligence permission required" });
    return null;
  }
  return { merchantId: merchant.id, userId };
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() && value.length <= max
    ? value.trim()
    : null;
}

function sourceUrl(value: unknown): string | null {
  const raw = text(value, 2048);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function watchFingerprint(input: {
  sourceUrl: string;
  sourceKind: "competitor" | "ad_spy";
  supplierProductId: number | null;
  intervalMinutes: number;
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function publicCaptureError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timed out") || message.includes("timeout")) return "The public product page timed out.";
  if (message.includes("private") || message.includes("internal") || message.includes("reserved")) {
    return "The URL resolved to a private or reserved network address; capture was refused.";
  }
  const status = message.match(/http\s+(\d{3})/);
  if (status) return `The source page returned HTTP ${status[1]}.`;
  return "Lunavo could not safely read this public product page. Confirm that it is accessible without signing in.";
}

router.get("/merchant/dropship/market-watches", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const rows = await db.execute(sql`
      SELECT w.id,w.source_kind,w.source_url,w.interval_minutes,w.status,
        w.last_observation_id,w.last_observed_title,w.last_observed_currency,
        w.last_observed_price_minor,w.last_observed_availability,w.last_checked_at,
        w.next_capture_at,w.last_error,w.consecutive_failures,w.capture_count,
        w.created_at,w.updated_at,w.supplier_product_id,p.title AS linked_product_title
      FROM dropship_market_watches w
      LEFT JOIN supplier_products p
        ON p.id=w.supplier_product_id AND p.merchant_id=w.merchant_id
      WHERE w.merchant_id=${ctx.merchantId}
      ORDER BY w.created_at DESC
      LIMIT ${MAX_MARKET_WATCHES_PER_MERCHANT}
    `);
    res.setHeader("Cache-Control", "no-store");
    res.json({ watches: rows.rows, maxWatches: MAX_MARKET_WATCHES_PER_MERCHANT });
  } catch (error) {
    next(error);
  }
});

router.post("/merchant/dropship/market-watches", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;

    const normalizedUrl = sourceUrl(req.body?.sourceUrl);
    const sourceKind = req.body?.sourceKind;
    const idempotencyKey = text(req.body?.idempotencyKey, 120);
    const intervalInput = req.body?.intervalMinutes;
    const intervalMinutes = typeof intervalInput === "number" ? intervalInput : Number(intervalInput);
    if (!normalizedUrl) {
      res.status(400).json({ error: "Enter a valid public HTTP(S) product URL without embedded credentials." });
      return;
    }
    if (sourceKind !== "competitor" && sourceKind !== "ad_spy") {
      res.status(400).json({ error: "Choose competitor or ad-spy monitoring." });
      return;
    }
    if (!isValidMarketWatchInterval(intervalMinutes)) {
      res.status(400).json({ error: "Capture intervals must be from 60 to 1,440 whole minutes." });
      return;
    }
    if (!idempotencyKey || !/^[A-Za-z0-9:_-]{8,120}$/.test(idempotencyKey)) {
      res.status(400).json({ error: "A valid idempotency key is required." });
      return;
    }

    const productRaw = req.body?.supplierProductId;
    const supplierProductId = productRaw == null || productRaw === "" ? null : Number(productRaw);
    if (supplierProductId !== null && (!Number.isSafeInteger(supplierProductId) || supplierProductId <= 0)) {
      res.status(400).json({ error: "Linked Lunavo product id must be a positive integer." });
      return;
    }

    const requestFingerprint = watchFingerprint({
      sourceUrl: normalizedUrl,
      sourceKind,
      supplierProductId,
      intervalMinutes,
    });
    const priorResult = await db.execute(sql`
      SELECT * FROM dropship_market_watches
      WHERE merchant_id=${ctx.merchantId} AND idempotency_key=${idempotencyKey}
      LIMIT 1
    `);
    const prior = priorResult.rows[0] as Record<string, unknown> | undefined;
    if (prior) {
      if (prior.request_fingerprint !== requestFingerprint) {
        res.status(409).json({ error: "This idempotency key was already used for a different monitoring request." });
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ watch: prior, replayed: true });
      return;
    }

    if (supplierProductId !== null) {
      const [product] = await db.select({ id: supplierProductsTable.id })
        .from(supplierProductsTable)
        .where(and(
          eq(supplierProductsTable.id, supplierProductId),
          eq(supplierProductsTable.merchantId, ctx.merchantId),
        ))
        .limit(1);
      if (!product) {
        res.status(404).json({ error: "Linked product was not found in this merchant workspace." });
        return;
      }
    }

    const countResult = await db.execute(sql`
      SELECT count(*)::int AS count
      FROM dropship_market_watches WHERE merchant_id=${ctx.merchantId}
    `);
    if (Number((countResult.rows[0] as { count?: unknown } | undefined)?.count ?? 0) >= MAX_MARKET_WATCHES_PER_MERCHANT) {
      res.status(429).json({ error: `A workspace can have at most ${MAX_MARKET_WATCHES_PER_MERCHANT} market watches. Delete an old watch before adding another.` });
      return;
    }

    // Import once before creating the watch. The importer pins DNS-resolved
    // requests and revalidates redirects, so private/internal destinations fail closed.
    let captured: Awaited<ReturnType<typeof importPublicSupplierProduct>>;
    try {
      captured = await importPublicSupplierProduct(normalizedUrl);
    } catch (error) {
      res.status(422).json({ error: publicCaptureError(error) });
      return;
    }

    const watchId = randomUUID();
    const observation = buildPublicMarketObservation({
      sourceKind,
      requestedUrl: normalizedUrl,
      captured,
      capturedAt: new Date(),
    });
    const initialFingerprint = createHash("sha256")
      .update(JSON.stringify({ watchId, requestFingerprint, capture: "initial" }))
      .digest("hex");

    const result = await db.transaction(async (tx) => {
      // Serialize watch creation per merchant so concurrent requests cannot exceed the workspace cap.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('dropship-market-watch:' || ${ctx.merchantId}::text))`);
      const lockedPriorResult = await tx.execute(sql`
        SELECT * FROM dropship_market_watches
        WHERE merchant_id=${ctx.merchantId} AND idempotency_key=${idempotencyKey}
        LIMIT 1
      `);
      const lockedPrior = lockedPriorResult.rows[0] as Record<string, unknown> | undefined;
      if (lockedPrior) {
        return {
          watch: lockedPrior,
          replayed: true,
          conflict: lockedPrior.request_fingerprint !== requestFingerprint,
        };
      }
      const lockedCount = await tx.execute(sql`
        SELECT count(*)::int AS count
        FROM dropship_market_watches WHERE merchant_id=${ctx.merchantId}
      `);
      if (Number((lockedCount.rows[0] as { count?: unknown } | undefined)?.count ?? 0) >= MAX_MARKET_WATCHES_PER_MERCHANT) {
        throw new MarketWatchLimitError("Market-watch workspace cap reached");
      }
      const inserted = await tx.execute(sql`
        INSERT INTO dropship_market_watches (
          id,merchant_id,supplier_product_id,source_kind,source_url,interval_minutes,
          status,next_capture_at,last_checked_at,idempotency_key,request_fingerprint,
          created_by,consecutive_failures,capture_count
        ) VALUES (
          ${watchId}::uuid,${ctx.merchantId},${supplierProductId},${sourceKind},${captured.sourceUrl},
          ${intervalMinutes},'active',now()+(${intervalMinutes} * interval '1 minute'),now(),
          ${idempotencyKey},${requestFingerprint},${ctx.userId},0,0
        )
        ON CONFLICT (merchant_id,idempotency_key) DO NOTHING
        RETURNING *
      `);
      const created = inserted.rows[0] as Record<string, unknown> | undefined;
      if (!created) {
        const existingResult = await tx.execute(sql`
          SELECT * FROM dropship_market_watches
          WHERE merchant_id=${ctx.merchantId} AND idempotency_key=${idempotencyKey}
          LIMIT 1
        `);
        const existing = existingResult.rows[0] as Record<string, unknown> | undefined;
        if (!existing) throw new Error("Market watch idempotency conflict could not be resolved");
        return {
          watch: existing,
          replayed: true,
          conflict: existing.request_fingerprint !== requestFingerprint,
        };
      }

      const research = await recordMarketResearch({
        merchantId: ctx.merchantId,
        supplierProductId,
        sourceKind,
        sourceUrl: observation.sourceUrl,
        currency: observation.currency,
        observedPriceMinor: observation.observedPriceMinor,
        notes: observation.notes,
        evidence: {
          ...observation.evidence,
          watch: { id: watchId, intervalMinutes, captureKind: "initial" },
        },
        capturedBy: ctx.userId,
        idempotencyKey: `market-watch:${watchId}:initial`,
        requestFingerprint: initialFingerprint,
      }, tx);

      const updated = await tx.execute(sql`
        UPDATE dropship_market_watches
        SET last_observation_id=${String(research.id)}::uuid,
            last_observed_title=${captured.title.slice(0, 500)},
            last_observed_currency=${observation.currency},
            last_observed_price_minor=${observation.observedPriceMinor},
            last_observed_availability=${captured.availability},
            capture_count=1,updated_at=now()
        WHERE id=${watchId}::uuid AND merchant_id=${ctx.merchantId}
        RETURNING *
      `);
      const watch = updated.rows[0] as Record<string, unknown> | undefined;
      if (!watch) throw new Error("Market watch could not be finalized");
      await emitDomainEvent(tx, {
        merchantId: ctx.merchantId,
        eventType: "dropship.market_research.observed",
        aggregateType: "dropship_market_watch",
        aggregateId: watchId,
        actorType: "merchant",
        actorId: ctx.userId,
        source: "merchant_api",
        idempotencyKey: `market-watch:${watchId}:created`,
        payload: {
          watchId,
          researchId: String(research.id),
          captureKind: "initial",
          sourceKind,
          sourceDomain: captured.sourceDomain,
          evidenceStatus: "page_observed_not_checkout_verified",
        },
      });
      return { watch, replayed: false, conflict: false };
    });

    if (result.conflict) {
      res.status(409).json({ error: "This idempotency key was already used for a different monitoring request." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(result.replayed ? 200 : 201).json({ watch: result.watch, replayed: result.replayed });
  } catch (error) {
    if (error instanceof MarketWatchLimitError) {
      res.status(429).json({ error: `A workspace can have at most ${MAX_MARKET_WATCHES_PER_MERCHANT} market watches. Delete an old watch before adding another.` });
      return;
    }
    next(error);
  }
});

router.patch("/merchant/dropship/market-watches/:id", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const id = typeof req.params.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)
      ? req.params.id.toLowerCase()
      : null;
    const status = req.body?.status;
    if (!id) {
      res.status(400).json({ error: "Invalid market watch id." });
      return;
    }
    if (status !== "active" && status !== "paused") {
      res.status(400).json({ error: "Choose active or paused." });
      return;
    }
    const updated = await db.execute(sql`
      UPDATE dropship_market_watches
      SET status=${status},
          next_capture_at=CASE WHEN ${status}='active' THEN now() ELSE next_capture_at END,
          consecutive_failures=CASE WHEN ${status}='active' THEN 0 ELSE consecutive_failures END,
          last_error=CASE WHEN ${status}='active' THEN NULL ELSE last_error END,
          claim_token=NULL,locked_at=NULL,updated_at=now()
      WHERE id=${id}::uuid AND merchant_id=${ctx.merchantId}
      RETURNING id,status,next_capture_at
    `);
    if (!updated.rows.length) {
      res.status(404).json({ error: "Market watch was not found in this workspace." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({ watch: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete("/merchant/dropship/market-watches/:id", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const id = typeof req.params.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)
      ? req.params.id.toLowerCase()
      : null;
    if (!id) {
      res.status(400).json({ error: "Invalid market watch id." });
      return;
    }
    const removed = await db.execute(sql`
      DELETE FROM dropship_market_watches
      WHERE id=${id}::uuid AND merchant_id=${ctx.merchantId}
      RETURNING id
    `);
    if (!removed.rows.length) {
      res.status(404).json({ error: "Market watch was not found in this workspace." });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
