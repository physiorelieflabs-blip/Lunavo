import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import { getAuth } from "../lib/auth-compat";
import { requirePermission } from "../lib/tenant-access";
import { emitDomainEvent } from "../lib/domain-events";
import { readLatestStoredFxRateSet } from "../lib/fx-rate-worker";
import { parseStorefrontId, parseSupplierProductId, quoteProductAdvertisingFee } from "../lib/commerce-growth-policy";
import {
  db,
  merchantsTable,
  sourcingSourcesTable,
  sourcingProductsTable,
  supplierProductsTable,
  sourcingPriceSnapshotsTable,
  productAdvertisingCampaignsTable,
  marketplaceDiscoveryEventsTable,
  commerceGrowthOpportunitiesTable,
  storeHealthChecksTable,
  merchantStorefrontsTable,
} from "@workspace/db";

const router: IRouter = Router();

async function merchantIdFor(req: Request): Promise<number> {
  const userId = getAuth(req).userId;
  if (!userId) throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  const merchant = (await db.select().from(merchantsTable).where(and(eq(merchantsTable.status, "active"), or(eq(merchantsTable.clerkUserId, userId), eq(merchantsTable.localAuthUserId, userId)))).limit(1))[0];
  if (!merchant) throw Object.assign(new Error("Merchant workspace not found"), { statusCode: 404 });
  await requirePermission(userId, merchant.id, "team.manage");
  return merchant.id;
}

function cleanUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 4096) throw Object.assign(new Error("A valid product URL is required"), { statusCode: 400 });
  let url: URL;
  try { url = new URL(value); } catch { throw Object.assign(new Error("Invalid product URL"), { statusCode: 400 }); }
  if (!["http:", "https:"].includes(url.protocol)) throw Object.assign(new Error("Only HTTP(S) product URLs are supported"), { statusCode: 400 });
  return url;
}

router.post("/growth/sourcing/sources", async (req, res, next) => {
  try {
    const actorId = getAuth(req).userId;
    const merchantId = await merchantIdFor(req);
    const url = cleanUrl(req.body?.sourceUrl);
    const source = await db.transaction(async (tx) => {
      const [created] = await tx.insert(sourcingSourcesTable).values({
        merchantId,
        sourceUrl: url.toString(),
        canonicalUrl: url.toString(),
        domain: url.hostname,
        sourceType: "product_url",
      }).returning();
      if (!created) throw new Error("Supplier source could not be registered");
      await emitDomainEvent(tx, {
        merchantId,
        eventType: "sourcing.source_registered",
        aggregateType: "sourcing_source",
        aggregateId: created.id,
        actorType: "merchant",
        actorId: actorId ?? null,
        source: "merchant_api",
        idempotencyKey: "sourcing-source-registered:" + created.id,
        payload: { sourceId: created.id, domain: created.domain, sourceType: created.sourceType },
        after: { sourceId: created.id, domain: created.domain, sourceType: created.sourceType },
      });
      return created;
    });
    res.status(201).json({ source }); return;
  } catch (error) { next(error); }
});

router.get("/growth/sourcing/sources", async (req, res, next) => {
  try {
    const merchantId = await merchantIdFor(req);
    const sources = await db.select().from(sourcingSourcesTable).where(eq(sourcingSourcesTable.merchantId, merchantId)).orderBy(desc(sourcingSourcesTable.createdAt));
    res.json({ sources }); return;
  } catch (error) { next(error); }
});

router.get("/growth/sourcing/products", async (req, res, next) => {
  try {
    const merchantId = await merchantIdFor(req);
    const products = await db.select().from(sourcingProductsTable).where(eq(sourcingProductsTable.merchantId, merchantId)).orderBy(desc(sourcingProductsTable.opportunityScore));
    res.json({ products }); return;
  } catch (error) { next(error); }
});

router.get("/growth/sourcing/products/:id/history", async (req, res, next) => {
  try {
    const merchantId = await merchantIdFor(req);
    const productId = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!/^[0-9a-fA-F-]{36}$/.test(productId)) { res.status(400).json({ error: "Invalid sourcing product id" }); return; }
    const product = (await db.select().from(sourcingProductsTable).where(and(eq(sourcingProductsTable.id, productId), eq(sourcingProductsTable.merchantId, merchantId))).limit(1))[0];
    if (!product) { res.status(404).json({ error: "Sourcing product not found" }); return; }
    const history = await db.select().from(sourcingPriceSnapshotsTable).where(eq(sourcingPriceSnapshotsTable.sourcingProductId, product.id)).orderBy(desc(sourcingPriceSnapshotsTable.capturedAt));
    res.json({ product, history }); return;
  } catch (error) { next(error); }
});

/**
 * Advertising is intentionally two-step: this endpoint creates a payable
 * campaign only. It cannot manufacture a successful payment or activate paid
 * placement. A verified TS Pay/provider transaction must later attach to it.
 */
router.post("/growth/advertising/campaigns", async (req, res, next) => {
  try {
    const merchantId = await merchantIdFor(req);
    const productId = parseSupplierProductId(req.body?.productId);
    if (productId === null) { res.status(400).json({ error: "A valid numeric supplier product ID is required" }); return; }
    const product = (await db.select({
      id: supplierProductsTable.id,
      status: supplierProductsTable.status,
      visibility: supplierProductsTable.visibility,
    }).from(supplierProductsTable).where(and(
      eq(supplierProductsTable.id, productId),
      eq(supplierProductsTable.merchantId, merchantId),
      eq(supplierProductsTable.status, "active"),
      eq(supplierProductsTable.visibility, "active"),
    )).limit(1))[0];
    if (!product) { res.status(404).json({ error: "An active, visible product in this merchant workspace is required" }); return; }

    const merchant = (await db.select({ currency: merchantsTable.currency })
      .from(merchantsTable).where(eq(merchantsTable.id, merchantId)).limit(1))[0];
    const currency = String(merchant?.currency ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) { res.status(409).json({ error: "Set a valid merchant settlement currency before advertising" }); return; }

    let quote: ReturnType<typeof quoteProductAdvertisingFee>;
    try {
      const rates = currency === "USD" ? null : await readLatestStoredFxRateSet();
      quote = quoteProductAdvertisingFee(currency, rates ?? {
        unitsPerUsd: { USD: 1 },
        asOfByCurrency: {},
        sourceByCurrency: { USD: "USD numeraire" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "A fresh local FX quote is unavailable";
      if (currency !== "USD") {
        res.status(503).json({ error: "A fresh locally stored FX rate is required before this campaign can be billed in " + currency, detail: message });
        return;
      }
      res.status(503).json({ error: "Campaign fee could not be quoted safely", detail: message });
      return;
    }

    const requestedStoreId = req.body?.storeId;
    let storeId: string | null = null;
    if (requestedStoreId !== undefined && requestedStoreId !== null && requestedStoreId !== "") {
      storeId = parseStorefrontId(requestedStoreId);
      if (!storeId) { res.status(400).json({ error: "A valid storefront ID is required" }); return; }
      const store = (await db.select({ id: merchantStorefrontsTable.id }).from(merchantStorefrontsTable)
        .where(and(eq(merchantStorefrontsTable.id, storeId), eq(merchantStorefrontsTable.merchantId, merchantId))).limit(1))[0];
      if (!store) { res.status(404).json({ error: "Storefront not found in this merchant workspace" }); return; }
    }

    const [campaign] = await db.insert(productAdvertisingCampaignsTable).values({
      merchantId,
      productId: String(product.id),
      storeId,
      feeMinor: quote.feeMinor,
      currency: quote.currency,
      status: "awaiting_payment",
      paymentStatus: "pending",
    }).returning();
    res.status(201).json({
      campaign,
      payableAmountMinor: quote.feeMinor,
      currency: quote.currency,
      baseAmountMinor: quote.baseAmountMinor,
      baseCurrency: quote.baseCurrency,
      fx: { rate: quote.fxRate, source: quote.fxSource, asOf: quote.fxAsOf, fetchedAt: quote.fxFetchedAt },
      paymentRequired: true,
      message: `Campaign created. Verify payment of the USD 5 equivalent in ${quote.currency} before placement can activate.`,
    }); return;
  } catch (error) { next(error); }
});

router.get("/growth/advertising/campaigns", async (req, res, next) => {
  try {
    const merchantId = await merchantIdFor(req);
    const campaigns = await db.select().from(productAdvertisingCampaignsTable).where(eq(productAdvertisingCampaignsTable.merchantId, merchantId)).orderBy(desc(productAdvertisingCampaignsTable.createdAt));
    res.json({ campaigns }); return;
  } catch (error) { next(error); }
});

router.post("/growth/discovery/events", async (req, res, next) => {
  try {
    const parsedProductId = parseSupplierProductId(req.body?.productId);
    const eventType = typeof req.body?.eventType === "string" ? req.body.eventType : "view";
    if (parsedProductId === null) { res.status(400).json({ error: "A valid numeric supplier product ID is required" }); return; }
    const product = (await db.select({
      id: supplierProductsTable.id,
      merchantId: supplierProductsTable.merchantId,
    }).from(supplierProductsTable).where(and(
      eq(supplierProductsTable.id, parsedProductId),
      eq(supplierProductsTable.status, "active"),
      eq(supplierProductsTable.visibility, "active"),
    )).limit(1))[0];
    if (!product) { res.status(404).json({ error: "Product not found or not publicly active" }); return; }
    const productId = String(product.id);
    if (!["impression", "click", "view", "add_to_cart"].includes(eventType)) { res.status(400).json({ error: "Unsupported discovery event. Purchase attribution is server-generated only." }); return; }
    const campaignId = typeof req.body?.campaignId === "string" ? req.body.campaignId.trim() : "";
    if (campaignId && !/^[0-9a-fA-F-]{36}$/.test(campaignId)) { res.status(400).json({ error: "Invalid campaignId" }); return; }
    if (campaignId) {
      const campaign = (await db.select({ id: productAdvertisingCampaignsTable.id })
        .from(productAdvertisingCampaignsTable)
        .where(and(eq(productAdvertisingCampaignsTable.id, campaignId), eq(productAdvertisingCampaignsTable.productId, productId), eq(productAdvertisingCampaignsTable.merchantId, product.merchantId), eq(productAdvertisingCampaignsTable.status, "active")))
        .limit(1))[0];
      if (!campaign) { res.status(404).json({ error: "Advertising campaign is not active for this product" }); return; }
    }
    const [event] = await db.insert(marketplaceDiscoveryEventsTable).values({
      productId,
      campaignId: campaignId || null,
      customerId: null,
      eventType,
      sessionKey: typeof req.body?.sessionKey === "string" ? req.body.sessionKey.slice(0, 200) : null,
      metadata: req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {},
    }).returning();
    res.status(201).json({ event }); return;
  } catch (error) { next(error); }
});

router.get("/growth/opportunities", async (req, res, next) => {
  try {
    const merchantId = await merchantIdFor(req);
    const opportunities = await db.select().from(commerceGrowthOpportunitiesTable).where(eq(commerceGrowthOpportunitiesTable.merchantId, merchantId)).orderBy(desc(commerceGrowthOpportunitiesTable.score), desc(commerceGrowthOpportunitiesTable.createdAt));
    res.json({ opportunities }); return;
  } catch (error) { next(error); }
});

router.get("/growth/store-health", async (req, res, next) => {
  try {
    const merchantId = await merchantIdFor(req);
    const [latest] = await db.select().from(storeHealthChecksTable).where(eq(storeHealthChecksTable.merchantId, merchantId)).orderBy(desc(storeHealthChecksTable.generatedAt)).limit(1);
    res.json({ health: latest ?? null }); return;
  } catch (error) { next(error); }
});

export default router;
