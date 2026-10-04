import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { getAuth } from "../lib/auth-compat";
import { requirePermission } from "../lib/tenant-access";
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
} from "@workspace/db";

const router: IRouter = Router();
const USD_CENTS = 500;

async function merchantIdFor(req: Request): Promise<number> {
  const userId = getAuth(req).userId;
  if (!userId) throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  const merchant = (await db.select().from(merchantsTable).where(eq(merchantsTable.clerkUserId, userId)).limit(1))[0];
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
    const merchantId = await merchantIdFor(req);
    const url = cleanUrl(req.body?.sourceUrl);
    const [source] = await db.insert(sourcingSourcesTable).values({ merchantId, sourceUrl: url.toString(), canonicalUrl: url.toString(), domain: url.hostname, sourceType: "product_url" }).returning();
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
    const productId = typeof req.body?.productId === "string" ? req.body.productId.trim() : "";
    if (!/^[0-9a-fA-F-]{36}$/.test(productId)) { res.status(400).json({ error: "Valid productId is required" }); return; }
    const product = (await db.select({ id: supplierProductsTable.id }).from(supplierProductsTable).where(and(eq(supplierProductsTable.id, productId), eq(supplierProductsTable.merchantId, merchantId))).limit(1))[0];
    if (!product) { res.status(404).json({ error: "Product not found in this merchant workspace" }); return; }
    const currency = typeof req.body?.currency === "string" ? req.body.currency.toUpperCase() : "USD";
    const [campaign] = await db.insert(productAdvertisingCampaignsTable).values({ merchantId, productId, storeId: req.body?.storeId || null, feeMinor: USD_CENTS, currency, status: "awaiting_payment", paymentStatus: "pending" }).returning();
    res.status(201).json({ campaign, payableAmountMinor: USD_CENTS, paymentRequired: true, message: "Campaign created. Complete and verify the $5 advertising payment before placement can activate." }); return;
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
    const productId = typeof req.body?.productId === "string" ? req.body.productId.trim() : "";
    const eventType = typeof req.body?.eventType === "string" ? req.body.eventType : "view";
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(productId)) { res.status(400).json({ error: "Valid productId is required" }); return; }
    const product = (await db.select({ id: supplierProductsTable.id }).from(supplierProductsTable).where(and(eq(supplierProductsTable.id, productId), eq(supplierProductsTable.status, "active"), eq(supplierProductsTable.visibility, "active")).limit(1)))[0];
    if (!product) { res.status(404).json({ error: "Product not found or not publicly active" }); return; }
    if (!["impression", "click", "view", "add_to_cart"].includes(eventType)) { res.status(400).json({ error: "Unsupported discovery event. Purchase attribution is server-generated only." }); return; }
    const campaignId = typeof req.body?.campaignId === "string" ? req.body.campaignId.trim() : "";
    if (campaignId && !/^[0-9a-fA-F-]{36}$/.test(campaignId)) { res.status(400).json({ error: "Invalid campaignId" }); return; }
    if (campaignId) {
      const campaign = (await db.select({ id: productAdvertisingCampaignsTable.id })
        .from(productAdvertisingCampaignsTable)
        .where(and(eq(productAdvertisingCampaignsTable.id, campaignId), eq(productAdvertisingCampaignsTable.productId, productId), eq(productAdvertisingCampaignsTable.status, "active")))
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
