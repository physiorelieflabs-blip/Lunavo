import { Router, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  db,
  merchantsTable,
  customersTable,
  supplierProductsTable,
  autoDsSettingsTable,
  fulfillmentJobsTable,
  discountCodesTable,
  loyaltyAccountsTable,
  affiliateOffersTable,
  digitalProductsTable,
} from "@workspace/db";

const router = Router();

async function merchantFor(req: Request) {
  const userId = getAuth(req).userId;
  if (!userId) return null;
  return (await db.select().from(merchantsTable).where(eq(merchantsTable.clerkUserId, userId)).limit(1))[0] ?? null;
}

function errorResponse(res: Response, status: number, error: string) {
  res.status(status).json({ error });
}

router.get("/automation/auto-ds", async (req, res) => {
  const merchant = await merchantFor(req);
  if (!merchant) return errorResponse(res, 401, "Authentication required");
  const settings = (await db.select().from(autoDsSettingsTable).where(eq(autoDsSettingsTable.merchantId, merchant.id)).limit(1))[0] ?? null;
  const jobs = await db.select().from(fulfillmentJobsTable).where(eq(fulfillmentJobsTable.merchantId, merchant.id)).orderBy(desc(fulfillmentJobsTable.createdAt)).limit(100);
  res.json({
    settings: settings ?? {
      merchantId: merchant.id, enabled: false, mode: "assisted",
      autoAllocateSupplierCost: false, requireApprovalBeforeExternalOrder: true,
      minimumMarginPercent: "10", defaultCarrier: null,
    },
    capabilities: {
      automaticInternalRouting: true,
      automaticSupplierApiOrdering: false,
      reason: "External supplier websites are not treated as APIs. Auto-DS can prepare and route an order automatically, but external supplier checkout requires a supported supplier API/adapter or merchant approval."
    },
    jobs,
  });
});

router.post("/automation/auto-ds", async (req, res) => {
  const merchant = await merchantFor(req);
  if (!merchant) return errorResponse(res, 401, "Authentication required");
  const enabled = req.body?.enabled === true;
  const mode = req.body?.mode === "auto" ? "auto" : "assisted";
  const autoAllocateSupplierCost = req.body?.autoAllocateSupplierCost === true;
  const requireApprovalBeforeExternalOrder = req.body?.requireApprovalBeforeExternalOrder !== false;
  const minimumMarginPercent = Number(req.body?.minimumMarginPercent);
  if (!Number.isFinite(minimumMarginPercent) || minimumMarginPercent < 0 || minimumMarginPercent > 100) return errorResponse(res, 400, "Minimum margin must be between 0 and 100");
  const current = (await db.select().from(autoDsSettingsTable).where(eq(autoDsSettingsTable.merchantId, merchant.id)).limit(1))[0];
  const values = { enabled, mode, autoAllocateSupplierCost, requireApprovalBeforeExternalOrder, minimumMarginPercent: minimumMarginPercent.toFixed(2), defaultCarrier: typeof req.body?.defaultCarrier === "string" ? req.body.defaultCarrier.trim().slice(0, 120) || null : null, updatedAt: new Date() };
  const saved = current
    ? (await db.update(autoDsSettingsTable).set(values).where(eq(autoDsSettingsTable.id, current.id)).returning())[0]
    : (await db.insert(autoDsSettingsTable).values({ merchantId: merchant.id, ...values }).returning())[0];
  if (!saved) return errorResponse(res, 500, "Auto-DS settings could not be saved");
  res.json({ settings: saved, note: mode === "auto"
    ? "Auto mode will automatically prepare and route eligible supplier-backed orders. External supplier ordering still requires a real supplier API/adapter or approval."
    : "Assisted mode prepares supplier fulfillment jobs for merchant review." });
});

router.get("/automation/fulfillment-jobs", async (req, res) => {
  const merchant = await merchantFor(req);
  if (!merchant) return errorResponse(res, 401, "Authentication required");
  const jobs = await db.select().from(fulfillmentJobsTable).where(eq(fulfillmentJobsTable.merchantId, merchant.id)).orderBy(desc(fulfillmentJobsTable.createdAt)).limit(100);
  res.json({ jobs });
});

router.post("/automation/fulfillment-jobs/:id/approve", async (req, res) => {
  const merchant = await merchantFor(req);
  if (!merchant) return errorResponse(res, 401, "Authentication required");
  const [updated] = await db.update(fulfillmentJobsTable).set({ status: "approved", updatedAt: new Date(), attempts: 0 })
    .where(and(eq(fulfillmentJobsTable.id, req.params.id), eq(fulfillmentJobsTable.merchantId, merchant.id), eq(fulfillmentJobsTable.status, "ready"))).returning();
  if (!updated) return errorResponse(res, 404, "Ready fulfillment job not found");
  res.json({ job: updated, next: "Open the supplier checkout URL or configure a real supplier fulfillment adapter for external order submission." });
});

router.get("/commerce/discount-codes", async (req, res) => {
  const merchant = await merchantFor(req);
  if (!merchant) return errorResponse(res, 401, "Authentication required");
  const codes = await db.select().from(discountCodesTable).where(eq(discountCodesTable.merchantId, merchant.id)).orderBy(desc(discountCodesTable.createdAt));
  res.json({ codes });
});

router.post("/commerce/discount-codes", async (req, res) => {
  const merchant = await merchantFor(req);
  if (!merchant) return errorResponse(res, 401, "Authentication required");
  const code = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
  const kind = req.body?.kind === "fixed" ? "fixed" : "percentage";
  const value = Number(req.body?.value);
  const minimumSubtotal = Number(req.body?.minimumSubtotal ?? 0);
  if (!/^[A-Z0-9_-]{3,40}$/.test(code) || !Number.isFinite(value) || value <= 0 || !Number.isFinite(minimumSubtotal) || minimumSubtotal < 0) return errorResponse(res, 400, "Enter a valid discount code and value");
  if (kind === "percentage" && value > 100) return errorResponse(res, 400, "Percentage discount cannot exceed 100");
  const [created] = await db.insert(discountCodesTable).values({
    merchantId: merchant.id, code, kind, value: value.toFixed(2), minimumSubtotal: minimumSubtotal.toFixed(2),
    currency: merchant.currency, active: true,
  }).returning();
  if (!created) return errorResponse(res, 409, "Discount code already exists or could not be created");
  res.status(201).json({ code: created });
});

router.post("/commerce/discount-codes/:id/deactivate", async (req, res) => {
  const merchant = await merchantFor(req);
  if (!merchant) return errorResponse(res, 401, "Authentication required");
  const [updated] = await db.update(discountCodesTable).set({ active: false, updatedAt: new Date() })
    .where(and(eq(discountCodesTable.id, Number(req.params.id)), eq(discountCodesTable.merchantId, merchant.id))).returning();
  if (!updated) return errorResponse(res, 404, "Discount code not found");
  res.json({ code: updated });
});

router.get("/commerce/loyalty", async (req, res) => {
  const merchant = await merchantFor(req);
  if (!merchant) return errorResponse(res, 401, "Authentication required");
  const accounts = await db.select({
    id: loyaltyAccountsTable.id,
    customerId: loyaltyAccountsTable.customerId,
    pointsBalance: loyaltyAccountsTable.pointsBalance,
    lifetimePoints: loyaltyAccountsTable.lifetimePoints,
    tier: loyaltyAccountsTable.tier,
    customerName: customersTable.name,
    customerEmail: customersTable.email,
  }).from(loyaltyAccountsTable).innerJoin(customersTable, eq(loyaltyAccountsTable.customerId, customersTable.id))
    .where(eq(loyaltyAccountsTable.merchantId, merchant.id)).orderBy(desc(loyaltyAccountsTable.pointsBalance)).limit(200);
  res.json({ accounts });
});

router.get("/commerce/affiliate-offers", async (req, res) => {
  const merchant = await merchantFor(req);
  if (!merchant) return errorResponse(res, 401, "Authentication required");
  const offers = await db.select({
    id: affiliateOffersTable.id,
    productId: affiliateOffersTable.supplierProductId,
    productTitle: supplierProductsTable.title,
    status: affiliateOffersTable.status,
    commissionBps: affiliateOffersTable.commissionBps,
    destinationUrl: affiliateOffersTable.destinationUrl,
  }).from(affiliateOffersTable).innerJoin(supplierProductsTable, eq(affiliateOffersTable.supplierProductId, supplierProductsTable.id))
    .where(eq(affiliateOffersTable.merchantId, merchant.id)).orderBy(desc(affiliateOffersTable.createdAt));
  res.json({ offers });
});

router.post("/commerce/affiliate-offers", async (req, res) => {
  const merchant = await merchantFor(req);
  if (!merchant) return errorResponse(res, 401, "Authentication required");
  const productId = Number(req.body?.productId);
  const commissionPercent = Number(req.body?.commissionPercent ?? 30);
  if (!Number.isInteger(productId) || productId < 1 || !Number.isFinite(commissionPercent) || commissionPercent < 1 || commissionPercent > 100) return errorResponse(res, 400, "Choose a valid product and commission");
  const product = (await db.select().from(supplierProductsTable).where(and(eq(supplierProductsTable.id, productId), eq(supplierProductsTable.merchantId, merchant.id))).limit(1))[0];
  if (!product) return errorResponse(res, 404, "Product not found");
  const [created] = await db.insert(affiliateOffersTable).values({
    merchantId: merchant.id,
    supplierProductId: productId,
    commissionBps: Math.round(commissionPercent * 100),
    destinationUrl: `/affiliate/${merchant.id}/${productId}`,
    status: "review",
  }).onConflictDoNothing().returning();
  if (!created) return errorResponse(res, 409, "Affiliate offer already exists");
  res.status(201).json({ offer: created });
});

router.get("/commerce/digital-products", async (req, res) => {
  const merchant = await merchantFor(req);
  if (!merchant) return errorResponse(res, 401, "Authentication required");
  const products = await db.select().from(digitalProductsTable).where(eq(digitalProductsTable.merchantId, merchant.id)).orderBy(desc(digitalProductsTable.createdAt));
  res.json({ products });
});

router.post("/commerce/digital-products", async (req, res) => {
  const merchant = await merchantFor(req);
  if (!merchant) return errorResponse(res, 401, "Authentication required");
  const kind = ["digital","course","membership","service"].includes(req.body?.kind) ? req.body.kind : "digital";
  const supplierProductId = Number.isInteger(Number(req.body?.supplierProductId)) ? Number(req.body.supplierProductId) : null;
  if (supplierProductId) {
    const product = (await db.select({ id: supplierProductsTable.id }).from(supplierProductsTable).where(and(eq(supplierProductsTable.id, supplierProductId), eq(supplierProductsTable.merchantId, merchant.id))).limit(1))[0];
    if (!product) return errorResponse(res, 404, "Source product not found");
  }
  const [created] = await db.insert(digitalProductsTable).values({
    merchantId: merchant.id, supplierProductId, kind,
    accessMode: req.body?.accessMode === "membership" ? "membership" : "purchase",
    dripEnabled: req.body?.dripEnabled === true,
    certificateEnabled: req.body?.certificateEnabled === true,
    curriculumPublic: req.body?.curriculumPublic === true,
  }).returning();
  res.status(201).json({ product: created });
});

export default router;
