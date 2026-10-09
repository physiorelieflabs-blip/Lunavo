import { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { db, merchantsTable } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { requirePermission, type PermissionKey } from "../lib/tenant-access";
import { emitDomainEvent } from "../lib/domain-events";
import { calculateLandedCost, type LandedCostInput } from "../lib/landed-cost";

const router = Router();
type Row = Record<string, unknown>;

function isRecord(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= max && !result.includes(String.fromCharCode(0)) ? result : null;
}
function numberIn(value: unknown, min: number, max: number, fallback?: number): number | null {
  if ((value === undefined || value === null || value === "") && fallback !== undefined) return fallback;
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}
function minor(value: unknown, fallback?: number): number | null {
  return numberIn(value, 0, Number.MAX_SAFE_INTEGER, fallback);
}
function code(value: unknown, length: number): string | null {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return new RegExp("^[A-Z]{" + length + "}$").test(normalized) ? normalized : null;
}
function urlValue(value: unknown): string | null | false {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return false;
    return url.toString();
  } catch {
    return false;
  }
}
function uuid(value: unknown): string | null {
  const result = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result) ? result : null;
}
function dbq(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Unsafe numeric SQL value");
    return String(value);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  const rendered = typeof value === "string" ? value : JSON.stringify(value);
  if (rendered.includes(String.fromCharCode(0))) throw new Error("Invalid null byte");
  return "'" + rendered.replaceAll("'", "''") + "'";
}
function jsonSql(value: Row): string {
  return dbq(JSON.stringify(value)) + "::jsonb";
}
function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function evidence(value: unknown): Row | null {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) return null;
  try {
    return JSON.stringify(value).length <= 6000 ? value : null;
  } catch {
    return null;
  }
}

async function merchantFor(req: Request, res: Response, permission: PermissionKey) {
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
    )).limit(1);
  if (!merchant) {
    res.status(404).json({ error: "Merchant workspace not found" });
    return null;
  }
  try {
    await requirePermission(userId, merchant.id, permission);
  } catch {
    res.status(403).json({ error: "Permission required: " + permission });
    return null;
  }
  return { merchantId: merchant.id, userId };
}

async function emitOperationEvent(
  merchantId: number,
  userId: string,
  created: boolean,
  aggregateType: string,
  aggregateId: string,
  idempotencyKey: string,
  payload: Row,
) {
  await emitDomainEvent(db, {
    merchantId,
    eventType: created ? "merchant.operation.created" : "merchant.operation.transitioned",
    aggregateType,
    aggregateId,
    actorType: "merchant",
    actorId: userId,
    source: "merchant_api",
    idempotencyKey,
    payload,
  });
}

router.get("/merchant/dropship/workbench/landed-cost", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res, "finance.manage");
    if (!ctx) return;
    const limit = Math.max(1, Math.min(100, Math.trunc(Number(req.query.limit ?? 30)) || 30));
    const rows = await db.execute((await import("drizzle-orm")).sql.raw(
      "SELECT s.*, p.title AS product_title " +
      "FROM dropship_landed_cost_scenarios s " +
      "LEFT JOIN supplier_products p ON p.id=s.supplier_product_id AND p.merchant_id=s.merchant_id " +
      "WHERE s.merchant_id=" + dbq(ctx.merchantId) +
      " ORDER BY s.created_at DESC LIMIT " + String(limit)
    ));
    res.setHeader("Cache-Control", "no-store");
    res.json({ scenarios: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/merchant/dropship/workbench/landed-cost", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res, "finance.manage");
    if (!ctx) return;
    const body = isRecord(req.body) ? req.body : {};
    const scenarioName = text(body.scenarioName, 160);
    const destinationCountry = code(body.destinationCountry, 2);
    const currency = code(body.currency, 3);
    const sourceCurrency = code(body.sourceCurrency ?? body.currency, 3);
    const idempotencyKey = text(body.idempotencyKey, 180);
    if (!scenarioName || !destinationCountry || !currency || !sourceCurrency ||
        !idempotencyKey || !/^[A-Za-z0-9._:-]{1,180}$/.test(idempotencyKey)) {
      res.status(400).json({ error: "Scenario name, destination country, calculation currency and idempotency key are required." });
      return;
    }
    const productId = body.supplierProductId == null || body.supplierProductId === ""
      ? null : numberIn(body.supplierProductId, 1, Number.MAX_SAFE_INTEGER);
    if (body.supplierProductId != null && body.supplierProductId !== "" && productId === null) {
      res.status(400).json({ error: "Invalid supplier product id." });
      return;
    }
    const quantity = numberIn(body.quantity, 1, 1_000_000, 1);
    const sourceCostMinor = minor(body.sourceCostMinor);
    const outboundShippingMinor = minor(body.outboundShippingMinor, 0);
    const freightMinor = minor(body.freightMinor, 0);
    const insuranceMinor = minor(body.insuranceMinor, 0);
    const handlingMinor = minor(body.handlingMinor, 0);
    const packagingMinor = minor(body.packagingMinor, 0);
    const sellingPriceMinor = minor(body.sellingPriceMinor);
    if ([quantity, sourceCostMinor, outboundShippingMinor, freightMinor, insuranceMinor, handlingMinor, packagingMinor, sellingPriceMinor].some((v) => v === null)) {
      res.status(400).json({ error: "Quantity and all costs/prices must be valid non-negative safe integer minor-unit amounts." });
      return;
    }
    const customsDutyBps = numberIn(body.customsDutyBps, 0, 10_000, 0);
    const importTaxBps = numberIn(body.importTaxBps, 0, 10_000, 0);
    const providerFeeBps = numberIn(body.providerFeeBps, 0, 10_000, 0);
    const returnsReserveBps = numberIn(body.returnsReserveBps, 0, 10_000, 0);
    if ([customsDutyBps, importTaxBps, providerFeeBps, returnsReserveBps].some((v) => v === null)) {
      res.status(400).json({ error: "Duty, tax, provider fee and returns reserve rates must be 0–10,000 basis points." });
      return;
    }
    const fxNormalizationNote = text(body.fxNormalizationNote, 1000);
    const fxEvidenceUrl = urlValue(body.fxEvidenceUrl);
    if (fxEvidenceUrl === false) {
      res.status(400).json({ error: "FX evidence must be a valid HTTP(S) URL without embedded credentials." });
      return;
    }
    if (sourceCurrency !== currency && !fxNormalizationNote && !fxEvidenceUrl) {
      res.status(400).json({ error: "Source and calculation currencies differ. Enter already-normalized amounts and supply an FX note or evidence URL; Lunavo will not guess an exchange rate." });
      return;
    }

    let linkedProduct: Row | null = null;
    if (productId !== null) {
      const productResult = await db.execute((await import("drizzle-orm")).sql.raw(
        "SELECT id,title,currency,source_url,source_domain FROM supplier_products WHERE id=" +
        dbq(productId) + " AND merchant_id=" + dbq(ctx.merchantId) + " LIMIT 1"
      ));
      linkedProduct = (productResult.rows[0] as Row | undefined) ?? null;
      if (!linkedProduct) {
        res.status(404).json({ error: "Supplier product not found in this merchant workspace." });
        return;
      }
      const productCurrency = code(linkedProduct.currency, 3);
      if (productCurrency && productCurrency !== sourceCurrency && !fxNormalizationNote && !fxEvidenceUrl) {
        res.status(400).json({ error: "Linked product currency differs from the source currency entered. Provide FX normalization evidence first." });
        return;
      }
    }

    const inputs: LandedCostInput = {
      sourceCostMinor: sourceCostMinor!,
      outboundShippingMinor: outboundShippingMinor!,
      freightMinor: freightMinor!,
      insuranceMinor: insuranceMinor!,
      handlingMinor: handlingMinor!,
      packagingMinor: packagingMinor!,
      sellingPriceMinor: sellingPriceMinor!,
      customsDutyBps: customsDutyBps!,
      importTaxBps: importTaxBps!,
      platformFeeBps: 100,
      providerFeeBps: providerFeeBps!,
      returnsReserveBps: returnsReserveBps!,
    };
    const result = calculateLandedCost(inputs);
    const userEvidence = evidence(body.evidence);
    if (userEvidence === null) {
      res.status(400).json({ error: "Evidence must be a JSON object smaller than 6 KB." });
      return;
    }
    const snapshot = {
      scenarioName, productId, destinationCountry, currency, sourceCurrency, quantity,
      inputs, fxNormalizationNote, fxEvidenceUrl, userEvidence,
    };
    const hash = fingerprint(snapshot);
    const storedEvidence: Row = {
      inputSource: "operator_supplied",
      sourceCurrency,
      calculationCurrency: currency,
      fxNormalizationNote,
      fxEvidenceUrl: fxEvidenceUrl ?? null,
      productSourceUrl: linkedProduct?.source_url ?? null,
      productSourceDomain: linkedProduct?.source_domain ?? null,
      currencyNormalization: sourceCurrency === currency ? "same_currency_input" : "operator_normalized_no_rate_inferred",
      dutyTaxRates: "operator_assumptions_not_statutory_tax_advice",
      allInputsArePerUnit: true,
      requestFingerprint: hash,
      userEvidence,
      warnings: [
        "All amounts are per-unit and interpreted in the selected calculation currency.",
        "Duty and import tax are estimates using the explicitly modeled tax bases; verify current destination-country rules.",
        "Contribution margin is not net profit and excludes costs not entered, including actual return losses, discounts and operating overhead.",
      ],
    };

    const sql = await import("drizzle-orm");
    const query =
      "INSERT INTO dropship_landed_cost_scenarios (" +
      "merchant_id,supplier_product_id,scenario_name,destination_country,currency,quantity," +
      "source_cost_minor,outbound_shipping_minor,freight_minor,insurance_minor,handling_minor,packaging_minor,selling_price_minor," +
      "customs_duty_bps,import_tax_bps,platform_fee_bps,provider_fee_bps,returns_reserve_bps," +
      "dutiable_base_minor,customs_duty_minor,import_tax_base_minor,import_tax_minor,landed_cost_minor," +
      "platform_fee_minor,provider_fee_minor,returns_reserve_minor,contribution_margin_minor,contribution_margin_bps," +
      "evidence,calculation_version,created_by,idempotency_key" +
      ") VALUES (" + [
        dbq(ctx.merchantId), dbq(productId), dbq(scenarioName), dbq(destinationCountry), dbq(currency), dbq(quantity),
        dbq(inputs.sourceCostMinor), dbq(inputs.outboundShippingMinor), dbq(inputs.freightMinor), dbq(inputs.insuranceMinor),
        dbq(inputs.handlingMinor), dbq(inputs.packagingMinor), dbq(inputs.sellingPriceMinor),
        dbq(inputs.customsDutyBps), dbq(inputs.importTaxBps), "100", dbq(inputs.providerFeeBps), dbq(inputs.returnsReserveBps),
        dbq(result.dutiableBaseMinor), dbq(result.customsDutyMinor), dbq(result.importTaxBaseMinor), dbq(result.importTaxMinor),
        dbq(result.landedCostMinor), dbq(result.platformFeeMinor), dbq(result.providerFeeMinor), dbq(result.returnsReserveMinor),
        dbq(result.contributionMarginMinor), dbq(result.contributionMarginBps), jsonSql(storedEvidence),
        dbq(result.calculationVersion), dbq(ctx.userId), dbq(idempotencyKey),
      ].join(",") + ") ON CONFLICT (merchant_id,idempotency_key) DO NOTHING RETURNING id,created_at";
    const inserted = await db.execute(sql.sql.raw(query));
    let record = (inserted.rows[0] as Row | undefined) ?? null;
    let replayed = false;
    if (!record) {
      const existing = await db.execute(sql.sql.raw(
        "SELECT id,created_at,evidence FROM dropship_landed_cost_scenarios WHERE merchant_id=" +
        dbq(ctx.merchantId) + " AND idempotency_key=" + dbq(idempotencyKey) + " LIMIT 1"
      ));
      record = (existing.rows[0] as Row | undefined) ?? null;
      if (!record) {
        res.status(409).json({ error: "Idempotency key is being claimed; retry with the same key." });
        return;
      }
      if (!isRecord(record.evidence) || record.evidence.requestFingerprint !== hash) {
        res.status(409).json({ error: "This idempotency key was already used for a different landed-cost scenario." });
        return;
      }
      replayed = true;
    } else {
      await emitOperationEvent(
        ctx.merchantId, ctx.userId, true, "dropship_landed_cost_scenario", String(record.id),
        "dropship-landed-cost:" + String(record.id) + ":created",
        { scenarioName, destinationCountry, currency, supplierProductId: productId, profitability: result.profitability }
      );
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(replayed ? 200 : 201).json({
      scenario: { id: record.id, createdAt: record.created_at, scenarioName, supplierProductId: productId, destinationCountry, currency, quantity, ...result },
      warnings: storedEvidence.warnings,
      persisted: true,
      replayed,
      executionBoundary: "advisory_cost_model_no_financial_or_inventory_mutation",
      calculationInputs: { ...inputs, sourceCurrency, fxNormalizationNote: fxNormalizationNote ?? null, fxEvidenceUrl: fxEvidenceUrl ?? null },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/merchant/dropship/workbench/quotes", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res, "fulfillment.manage");
    if (!ctx) return;
    const sql = await import("drizzle-orm");
    const rows = await db.execute(sql.sql.raw(
      "SELECT q.*,p.title AS linked_product_title FROM dropship_supplier_quote_requests q " +
      "LEFT JOIN supplier_products p ON p.id=q.supplier_product_id AND p.merchant_id=q.merchant_id " +
      "WHERE q.merchant_id=" + dbq(ctx.merchantId) +
      " ORDER BY q.updated_at DESC LIMIT 100"
    ));
    res.setHeader("Cache-Control", "no-store");
    res.json({
      quotes: rows.rows,
      executionBoundary: "internal_supplier_negotiation_record; no external message or purchase order is sent",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/merchant/dropship/workbench/quotes", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res, "fulfillment.manage");
    if (!ctx) return;
    const body = isRecord(req.body) ? req.body : {};
    const productId = body.supplierProductId == null || body.supplierProductId === ""
      ? null : numberIn(body.supplierProductId, 1, Number.MAX_SAFE_INTEGER);
    if (body.supplierProductId != null && body.supplierProductId !== "" && productId === null) {
      res.status(400).json({ error: "Invalid supplier product id." });
      return;
    }
    const supplierName = text(body.supplierName, 180);
    const destinationCountry = code(body.destinationCountry, 2);
    const currency = code(body.currency, 3);
    const quantity = numberIn(body.quantity, 1, 1_000_000, 1);
    const targetPrice = body.targetUnitPriceMinor == null || body.targetUnitPriceMinor === "" ? null : minor(body.targetUnitPriceMinor);
    const deliveryDays = body.desiredDeliveryDays == null || body.desiredDeliveryDays === "" ? null : numberIn(body.desiredDeliveryDays, 1, 365);
    const key = text(body.idempotencyKey, 180);
    const requestNotes = text(body.requestNotes, 3000);
    let sourceUrl = urlValue(body.sourceUrl);
    if (sourceUrl === false) {
      res.status(400).json({ error: "Source URL must be a valid HTTP(S) URL without embedded credentials." });
      return;
    }
    if (!destinationCountry || !currency || quantity === null || !key || !/^[A-Za-z0-9._:-]{1,180}$/.test(key) ||
        (body.targetUnitPriceMinor != null && body.targetUnitPriceMinor !== "" && targetPrice === null) ||
        (body.desiredDeliveryDays != null && body.desiredDeliveryDays !== "" && deliveryDays === null)) {
      res.status(400).json({ error: "Destination, currency, quantity and idempotency key are required; optional target price and delivery estimate must be valid." });
      return;
    }
    let productTitle = text(body.productTitle, 240);
    const sku = text(body.sku, 120);
    if (productId !== null) {
      const sql = await import("drizzle-orm");
      const found = await db.execute(sql.sql.raw(
        "SELECT id,title,source_url FROM supplier_products WHERE id=" + dbq(productId) +
        " AND merchant_id=" + dbq(ctx.merchantId) + " LIMIT 1"
      ));
      const product = (found.rows[0] as Row | undefined) ?? null;
      if (!product) {
        res.status(404).json({ error: "Supplier product not found in this merchant workspace." });
        return;
      }
      productTitle = productTitle ?? text(product.title, 240);
      sourceUrl = sourceUrl ?? urlValue(product.source_url);
      if (sourceUrl === false) {
        res.status(400).json({ error: "The linked product source URL is invalid; correct it before preparing this request." });
        return;
      }
    }
    if (!productTitle) {
      res.status(400).json({ error: "Product title is required when no linked product is selected." });
      return;
    }

    const snapshot = { productId, supplierName, productTitle, sku, sourceUrl, destinationCountry, currency, quantity, targetPrice, deliveryDays, requestNotes };
    const hash = fingerprint(snapshot);
    const storedEvidence = { requestFingerprint: hash, externalDispatch: "not_sent", inputSource: "merchant_entered" };
    const sql = await import("drizzle-orm");
    const inserted = await db.execute(sql.sql.raw(
      "INSERT INTO dropship_supplier_quote_requests (" +
      "merchant_id,supplier_product_id,supplier_name,product_title,sku,source_url,destination_country,currency,quantity," +
      "target_unit_price_minor,desired_delivery_days,status,request_notes,evidence,idempotency_key,created_by,updated_by" +
      ") VALUES (" + [
        dbq(ctx.merchantId), dbq(productId), dbq(supplierName), dbq(productTitle), dbq(sku), dbq(sourceUrl),
        dbq(destinationCountry), dbq(currency), dbq(quantity), dbq(targetPrice), dbq(deliveryDays), dbq("draft"),
        dbq(requestNotes), jsonSql(storedEvidence), dbq(key), dbq(ctx.userId), dbq(ctx.userId),
      ].join(",") + ") ON CONFLICT (merchant_id,idempotency_key) DO NOTHING RETURNING id,status,created_at,updated_at"
    ));
    let row = (inserted.rows[0] as Row | undefined) ?? null;
    let replayed = false;
    if (!row) {
      const existing = await db.execute(sql.sql.raw(
        "SELECT id,status,created_at,updated_at,evidence FROM dropship_supplier_quote_requests " +
        "WHERE merchant_id=" + dbq(ctx.merchantId) + " AND idempotency_key=" + dbq(key) + " LIMIT 1"
      ));
      row = (existing.rows[0] as Row | undefined) ?? null;
      if (!row) {
        res.status(409).json({ error: "Idempotency key is being claimed; retry with the same key." });
        return;
      }
      if (!isRecord(row.evidence) || row.evidence.requestFingerprint !== hash) {
        res.status(409).json({ error: "This idempotency key was already used for a different supplier request." });
        return;
      }
      replayed = true;
    } else {
      await emitOperationEvent(
        ctx.merchantId, ctx.userId, true, "dropship_supplier_quote_request", String(row.id),
        "dropship-supplier-quote:" + String(row.id) + ":created",
        { supplierProductId: productId, destinationCountry, currency, quantity, externalDispatch: "not_sent" }
      );
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(replayed ? 200 : 201).json({
      quoteRequest: { ...row, supplierProductId: productId, supplierName, productTitle, sku, sourceUrl, destinationCountry, currency, quantity, targetUnitPriceMinor: targetPrice, desiredDeliveryDays: deliveryDays, requestNotes },
      replayed,
      persisted: true,
      executionBoundary: "draft_only_no_supplier_message_no_purchase_order_no_payment",
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/merchant/dropship/workbench/quotes/:id", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res, "fulfillment.manage");
    if (!ctx) return;
    const id = uuid(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid supplier quote request id." });
      return;
    }
    const body = isRecord(req.body) ? req.body : {};
    const action = text(body.action, 32);
    const sql = await import("drizzle-orm");
    const found = await db.execute(sql.sql.raw(
      "SELECT * FROM dropship_supplier_quote_requests WHERE id=" + dbq(id) + "::uuid AND merchant_id=" + dbq(ctx.merchantId) + " LIMIT 1"
    ));
    const current = (found.rows[0] as Row | undefined) ?? null;
    if (!current) {
      res.status(404).json({ error: "Supplier quote request not found." });
      return;
    }

    let nextStatus: string;
    let unitPrice: number | null = null;
    let shipping: number | null = null;
    let total: number | null = null;
    let eta: number | null = null;
    let expiryIso: string | null = null;
    let notes: string | null = null;
    let evidenceUrl = urlValue(body.quoteEvidenceUrl);
    if (evidenceUrl === false) {
      res.status(400).json({ error: "Quote evidence URL must be a valid HTTP(S) URL without embedded credentials." });
      return;
    }
    if (action === "record_quote") {
      if (current.status !== "draft") {
        res.status(409).json({ error: "Only a draft request can receive a manually recorded supplier quote." });
        return;
      }
      unitPrice = minor(body.quotedUnitPriceMinor);
      shipping = minor(body.quotedShippingMinor, 0);
      eta = numberIn(body.quotedDeliveryDays, 1, 365);
      notes = text(body.quoteNotes, 3000);
      if (unitPrice === null || shipping === null || eta === null) {
        res.status(400).json({ error: "A supplier quote requires valid unit price, shipping and delivery days." });
        return;
      }
      const expiryText = text(body.quoteExpiresAt, 80);
      if (expiryText) {
        const time = Date.parse(expiryText);
        if (!Number.isFinite(time) || time <= Date.now()) {
          res.status(400).json({ error: "Quote expiry must be a valid future date." });
          return;
        }
        expiryIso = new Date(time).toISOString();
      }
      const amount = BigInt(unitPrice) * BigInt(Number(current.quantity)) + BigInt(shipping);
      if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
        res.status(400).json({ error: "Quoted total exceeds the supported exact-integer range." });
        return;
      }
      total = Number(amount);
      nextStatus = "quoted";
    } else if (action === "accept") {
      if (current.status !== "quoted") {
        res.status(409).json({ error: "Only a recorded supplier quote can be accepted." });
        return;
      }
      if (current.quote_expires_at && new Date(String(current.quote_expires_at)).getTime() <= Date.now()) {
        res.status(409).json({ error: "The supplier quote has expired and cannot be accepted." });
        return;
      }
      nextStatus = "accepted";
    } else if (action === "reject" || action === "cancel") {
      if (!["draft", "quoted"].includes(String(current.status))) {
        res.status(409).json({ error: "This quote request is already final and cannot be changed." });
        return;
      }
      nextStatus = action === "reject" ? "rejected" : "cancelled";
    } else if (action === "expire") {
      if (current.status !== "quoted" || !current.quote_expires_at ||
          new Date(String(current.quote_expires_at)).getTime() > Date.now()) {
        res.status(409).json({ error: "Only a quote with a recorded past expiry can be marked expired." });
        return;
      }
      nextStatus = "expired";
    } else {
      res.status(400).json({ error: "Unsupported action. Use record_quote, accept, reject, cancel or expire." });
      return;
    }

    const statusLiteral = dbq(nextStatus);
    const recordQuote = action === "record_quote";
    const evidenceMerge = recordQuote
      ? "evidence || " + jsonSql({ quoteEvidenceUrl: evidenceUrl ?? null, externalDispatch: "not_sent", quoteEnteredManually: true })
      : "evidence";
    const updated = await db.execute(sql.sql.raw(
      "UPDATE dropship_supplier_quote_requests SET " +
      "status=" + statusLiteral + "," +
      "quoted_unit_price_minor=COALESCE(" + dbq(unitPrice) + ",quoted_unit_price_minor)," +
      "quoted_shipping_minor=COALESCE(" + dbq(shipping) + ",quoted_shipping_minor)," +
      "quoted_total_minor=COALESCE(" + dbq(total) + ",quoted_total_minor)," +
      "quoted_delivery_days=COALESCE(" + dbq(eta) + ",quoted_delivery_days)," +
      "quote_expires_at=" + (recordQuote ? dbq(expiryIso) : "quote_expires_at") + "," +
      "quote_notes=" + (recordQuote ? dbq(notes) : "quote_notes") + "," +
      "evidence=" + evidenceMerge + "," +
      "updated_by=" + dbq(ctx.userId) + ",updated_at=now() " +
      "WHERE id=" + dbq(id) + "::uuid AND merchant_id=" + dbq(ctx.merchantId) +
      " AND status=" + dbq(String(current.status)) +
      " RETURNING id,status,quoted_unit_price_minor,quoted_shipping_minor,quoted_total_minor,quoted_delivery_days,quote_expires_at,updated_at"
    ));
    const row = (updated.rows[0] as Row | undefined) ?? null;
    if (!row) {
      res.status(409).json({ error: "The quote changed concurrently. Reload it and retry." });
      return;
    }
    await emitOperationEvent(
      ctx.merchantId, ctx.userId, false, "dropship_supplier_quote_request", id,
      "dropship-supplier-quote:" + id + ":" + nextStatus,
      { previousStatus: String(current.status), status: nextStatus, externalDispatch: "not_sent" }
    );
    res.setHeader("Cache-Control", "no-store");
    res.json({
      quoteRequest: row,
      persisted: true,
      executionBoundary: "manual_quote_record_only_no_supplier_message_no_purchase_order_no_payment_no_inventory_mutation",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
