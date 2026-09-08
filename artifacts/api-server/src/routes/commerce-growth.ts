import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  db,
  merchantsTable,
  sourcingSourcesTable,
  sourcingProductsTable,
  sourcingPriceSnapshotsTable,
  productAdvertisingCampaignsTable,
  marketplaceDiscoveryEventsTable,
  commerceGrowthOpportunitiesTable,
  storeHealthChecksTable,
} from "@workspace/db";

const router: IRouter = Router();
const USD_CENTS = 500;

async function merchantIdFor(req: Request): Promise<number> {
  const userId = getAuth(req).userId;
  if (!userId) throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  const merchant = await db.query.merchantsTable.findFirst({ where: eq(merchantsTable.clerkUserId, userId) });
  if (!merchant) throw Object.assign(new Error("Merchant workspace not found"), { statusCode: 404 });
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
    const merchantId = await merchantIdFor(req);
    const url = cleanUrl(req.body?.sourceUrl);
    const [source] = await db.insert(sourcingSourcesTable).values({ merchantId, sourceUrl: url.toString(), canonicalUrl: url.toString(), domain: url.hostname, sourceType: "product_url" }).returning();
    res.status(201).json({ source });
  } catch (error) { next(error); }
});

router.get("/growth/sourcing/sources", async (req, res, next) => {
  try {
    const merchantId = await merchantIdFor(req);
    const sources = await db.select().from(sourcingSourcesTable).where(eq(sourcingSourcesTable.merchantId, merchantId)).orderBy(desc(sourcingSourcesTable.createdAt));
    res.json({ sources });
  } catch (error) { next(error); }
});

router.get("/growth/sourcing/products", async (req, res, next) => {
  try {
    const merchantId = await merchantIdFor(req);
    const products = await db.select().from(sourcingProductsTable).where(eq(sourcingProductsTable.merchantId, merchantId)).orderBy(desc(sourcingProductsTable.opportunityScore));
    return res.json({ products });
  } catch (error) { next(error); }
});

router.get("/growth/sourcing/products/:id/history", async (req, res, next) => {
  try {
    const merchantId = await merchantIdFor(req);
    const product = await db.query.sourcingProductsTable.findFirst({ where: and(eq(sourcingProductsTable.id, req.params.id), eq(sourcingProductsTable.merchantId, merchantId)) });
    if (!product) return res.status(404).json({ error: "Sourcing product not found" });
    const history = await db.select().from(sourcingPriceSnapshotsTable).where(eq(sourcingPriceSnapshotsTable.sourcingProductId, product.id)).orderBy(desc(sourcingPriceSnapshotsTable.capturedAt));
    return res.json({ product, history });
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
    const productId = Number(req.body?.productId);
    if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: "Valid productId is required" });
    const currency = typeof req.body?.currency === "string" ? req.body.currency.toUpperCase() : "USD";
    const [campaign] = await db.insert(productAdvertisingCampaignsTable).values({ merchantId, productId, storeId: req.body?.storeId || null, feeMinor: USD_CENTS, currency, status: "awaiting_payment", paymentStatus: "pending" }).returning();
    return res.status(201).json({ campaign, payableAmountMinor: USD_CENTS, paymentRequired: true, message: "Campaign created. Complete and verify the $5 advertising payment before placement can activate." });
  } catch (error) { next(error); }
});

router.get("/growth/advertising/campaigns", async (req, res, next) => {
  try {
    const merchantId = await merchantIdFor(req);
    const campaigns = await db.select().from(productAdvertisingCampaignsTable).where(eq(productAdvertisingCampaignsTable.merchantId, merchantId)).orderBy(desc(productAdvertisingCampaignsTable.createdAt));
    return res.json({ campaigns });
  } catch (error) { next(error); }
});

router.post("/growth/discovery/events", async (req, res, next) => {
  try {
    const productId = Number(req.body?.productId);
    const eventType = typeof req.body?.eventType === "string" ? req.body.eventType : "view";
    if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: "Valid productId is required" });
    if (!["impression", "click", "view", "add_to_cart", "purchase"].includes(eventType)) return res.status(400).json({ error: "Unsupported discovery event" });
    const [event] = await db.insert(marketplaceDiscoveryEventsTable).values({ productId, campaignId: req.body?.campaignId || null, customerId: Number.isInteger(Number(req.body?.customerId)) ? Number(req.body.customerId) : null, eventType, sessionKey: typeof req.body?.sessionKey === "string" ? req.body.sessionKey.slice(0, 200) : null, metadata: req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {} }).returning();
    return res.status(201).json({ event });
  } catch (error) { next(error); }
});

router.get("/growth/opportunities", async (req, res, next) => {
  try {
    const merchantId = await merchantIdFor(req);
    const opportunities = await db.select().from(commerceGrowthOpportunitiesTable).where(eq(commerceGrowthOpportunitiesTable.merchantId, merchantId)).orderBy(desc(commerceGrowthOpportunitiesTable.score), desc(commerceGrowthOpportunitiesTable.createdAt));
    res.json({ opportunities });
  } catch (error) { next(error); }
});

router.get("/growth/store-health", async (req, res, next) => {
  try {
    const merchantId = await merchantIdFor(req);
    const [latest] = await db.select().from(storeHealthChecksTable).where(eq(storeHealthChecksTable.merchantId, merchantId)).orderBy(desc(storeHealthChecksTable.generatedAt)).limit(1);
    res.json({ health: latest ?? null });
  } catch (error) { next(error); }
});

export default router;
