import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { and, desc, eq, exists, gte, ilike, or, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  db,
  merchantsTable,
  marketplaceListingsTable,
  marketplaceBillingRecordsTable,
  paymentIntentsTable,
  paymentDestinationsTable,
  supplierProductsTable,
} from "@workspace/db";
import { completeGeminiChat } from "../lib/gemini";
import {
  initializeFlutterwavePayment,
  initializeFlutterwaveVirtualAccount,
  isFlutterwaveConfigured,
  supportsFlutterwaveDirectBankTransfer,
  verifyFlutterwaveTransaction,
} from "../lib/flutterwave-client";
import { processVerifiedFlutterwaveTransaction } from "./flutterwave-payment-processor";

const router = Router();
const PARTICIPATION_DAYS = 30;
const PRODUCT_AD_DAYS = 30;
const AD_FEE_USD = 5;

function requestOrigin(req: Request): string {
  const configured = process.env.PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0].trim();
  return host ? `${proto}://${host}` : "";
}

async function authenticatedMerchant(req: Request) {
  const userId = getAuth(req).userId;
  if (!userId) return null;
  return (await db.select().from(merchantsTable).where(and(
    eq(merchantsTable.clerkUserId, userId),
    eq(merchantsTable.status, "active"),
  )).limit(1))[0] ?? null;
}

function publicProduct(product: typeof supplierProductsTable.$inferSelect, merchantKey: string | null, merchantName: string) {
  return {
    id: product.id,
    merchantKey,
    merchantName: merchantName || "Independent merchant",
    title: product.title,
    description: product.description,
    imageUrl: product.imageUrl,
    price: Number(product.sellingPrice),
    currency: product.currency,
    category: product.category,
    brand: product.brand,
    availability: product.availability,
    availabilityQuantity: product.availabilityQuantity,
    sponsored: true,
    storeUrl: merchantKey ? `/store/${merchantKey}` : null,
    productUrl: merchantKey ? `/checkout/${merchantKey}?productId=${product.id}` : null,
  };
}

async function eligibleProducts(input: { search?: string; category?: string; currency?: string; limit?: number }) {
  const search = input.search?.trim().slice(0, 120) ?? "";
  const category = input.category?.trim().slice(0, 120) ?? "";
  const currency = input.currency?.trim().toUpperCase().slice(0, 3) ?? "";
  const adCutoff = new Date(Date.now() - PRODUCT_AD_DAYS * 86_400_000);
  const participationCutoff = new Date(Date.now() - PARTICIPATION_DAYS * 86_400_000);
  const filters = [
    eq(merchantsTable.status, "active"),
    sql`${merchantsTable.publicStoreKey} is not null`,
    eq(supplierProductsTable.status, "active"),
    eq(supplierProductsTable.visibility, "active"),
    eq(marketplaceListingsTable.status, "approved"),
    eq(marketplaceListingsTable.listingFeeStatus, "paid"),
    exists(db.select({ id: marketplaceBillingRecordsTable.id }).from(marketplaceBillingRecordsTable).where(and(
      eq(marketplaceBillingRecordsTable.merchantId, merchantsTable.id),
      eq(marketplaceBillingRecordsTable.kind, "monthly"),
      eq(marketplaceBillingRecordsTable.status, "paid"),
      gte(marketplaceBillingRecordsTable.paidAt, participationCutoff),
    ))),
    exists(db.select({ id: marketplaceBillingRecordsTable.id }).from(marketplaceBillingRecordsTable).where(and(
      eq(marketplaceBillingRecordsTable.merchantId, merchantsTable.id),
      eq(marketplaceBillingRecordsTable.listingId, marketplaceListingsTable.id),
      eq(marketplaceBillingRecordsTable.kind, "listing"),
      eq(marketplaceBillingRecordsTable.status, "paid"),
      gte(marketplaceBillingRecordsTable.paidAt, adCutoff),
    ))),
    sql`${supplierProductsTable.sellingPrice} is not null`,
  ];
  if (search) filters.push(or(ilike(supplierProductsTable.title, `%${search}%`), ilike(supplierProductsTable.description, `%${search}%`))!);
  if (category) filters.push(eq(supplierProductsTable.category, category));
  if (currency) filters.push(eq(supplierProductsTable.currency, currency));
  return db.select({ product: supplierProductsTable, merchantKey: merchantsTable.publicStoreKey, merchantName: merchantsTable.storeName })
    .from(marketplaceListingsTable)
    .innerJoin(supplierProductsTable, eq(marketplaceListingsTable.supplierProductId, supplierProductsTable.id))
    .innerJoin(merchantsTable, eq(marketplaceListingsTable.merchantId, merchantsTable.id))
    .where(and(...filters))
    .orderBy(desc(supplierProductsTable.publishedAt), desc(supplierProductsTable.importedAt))
    .limit(Math.min(100, Math.max(1, input.limit ?? 48)));
}

router.get("/shop/discovery", async (req, res): Promise<void> => {
  const rows = await eligibleProducts({
    search: typeof req.query.search === "string" ? req.query.search : "",
    category: typeof req.query.category === "string" ? req.query.category : "",
    currency: typeof req.query.currency === "string" ? req.query.currency : "",
    limit: typeof req.query.limit === "string" ? Number(req.query.limit) : 48,
  });
  res.json({
    generatedAt: new Date().toISOString(),
    categories: [...new Set(rows.map(({ product }) => product.category).filter(Boolean))],
    products: rows.map(({ product, merchantKey, merchantName }) => publicProduct(product, merchantKey, merchantName)),
  });
});

router.get("/shop/products/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: "Invalid product id" }); return; }
  const rows = await eligibleProducts({ limit: 100 });
  const row = rows.find(({ product }) => product.id === id);
  if (!row) { res.status(404).json({ error: "Product is not currently promoted in the shopper marketplace" }); return; }
  res.json({
    product: publicProduct(row.product, row.merchantKey, row.merchantName),
    related: rows.filter(({ product }) => product.id !== id && product.category === row.product.category).slice(0, 8).map(({ product, merchantKey, merchantName }) => publicProduct(product, merchantKey, merchantName)),
  });
});

// Backwards-compatible marketplace read path using the same paid-discovery rules.
router.get("/marketplace/products", async (req, res): Promise<void> => {
  const rows = await eligibleProducts({
    search: typeof req.query.search === "string" ? req.query.search : "",
    category: typeof req.query.category === "string" ? req.query.category : "",
    currency: typeof req.query.currency === "string" ? req.query.currency : "",
    limit: 100,
  });
  res.json(rows.map(({ product, merchantKey, merchantName }) => ({ ...publicProduct(product, merchantKey, merchantName), salePrice: null })));
});

router.post("/shop/ai-concierge", async (req, res): Promise<void> => {
  const query = typeof req.body?.query === "string" ? req.body.query.trim().slice(0, 1000) : "";
  if (query.length < 3) { res.status(400).json({ error: "Tell the shopping concierge what you are looking for." }); return; }
  try {
    const rows = await eligibleProducts({ limit: 40 });
    const catalog = rows.map(({ product, merchantName }) => ({ id: product.id, merchant: merchantName, title: product.title, description: product.description, category: product.category, price: Number(product.sellingPrice), currency: product.currency }));
    const response = await completeGeminiChat([
      { role: "system", content: [
        "You are the TS Commerce shopper concierge.",
        "Recommend only products in the supplied catalog.",
        "Never invent products, specifications, availability, seller claims, prices, discounts, or delivery promises.",
        "Return JSON only: {\"summary\":string,\"recommendations\":[{\"id\":number,\"reason\":string}]}.",
        "Return at most 6 recommendations.",
        `Catalog: ${JSON.stringify(catalog)}`,
      ].join("\n") },
      { role: "user", content: query },
    ]);
    const parsed = JSON.parse(response.content.trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, "")) as { summary?: unknown; recommendations?: unknown };
    const byId = new Map(rows.map(({ product, merchantKey, merchantName }) => [product.id, { product, merchantKey, merchantName }]));
    const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations.map((item) => {
      if (!item || typeof item !== "object") return null;
      const value = item as Record<string, unknown>;
      const row = byId.get(Number(value.id));
      return row ? { ...publicProduct(row.product, row.merchantKey, row.merchantName), reason: String(value.reason ?? "Relevant to your request").slice(0, 260) } : null;
    }).filter(Boolean).slice(0, 6) : [];
    res.json({ summary: String(parsed.summary ?? "Here are the strongest matches from the current marketplace."), recommendations, model: response.model });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Shopping concierge is temporarily unavailable." });
  }
});

router.post("/marketplace/advertising/:id/checkout", async (req, res): Promise<void> => {
  const merchant = await authenticatedMerchant(req);
  if (!merchant) { res.status(401).json({ error: "Merchant authentication is required." }); return; }
  const listingId = Number(req.params.id);
  if (!Number.isInteger(listingId) || listingId < 1) { res.status(400).json({ error: "Invalid marketplace listing." }); return; }
  const listing = (await db.select().from(marketplaceListingsTable).where(and(eq(marketplaceListingsTable.id, listingId), eq(marketplaceListingsTable.merchantId, merchant.id))).limit(1))[0];
  if (!listing) { res.status(404).json({ error: "Marketplace listing not found." }); return; }
  if (listing.listingFeeStatus === "paid") { res.json({ status: "paid", listingId, message: "The product advertising fee is already verified." }); return; }
  if (!isFlutterwaveConfigured()) { res.status(503).json({ error: "Flutterwave is not configured for advertising payments." }); return; }
  let [billing] = await db.select().from(marketplaceBillingRecordsTable).where(and(eq(marketplaceBillingRecordsTable.merchantId, merchant.id), eq(marketplaceBillingRecordsTable.listingId, listing.id), eq(marketplaceBillingRecordsTable.kind, "listing"))).orderBy(desc(marketplaceBillingRecordsTable.createdAt)).limit(1);
  if (!billing || ["rejected", "reversed"].includes(billing.status)) {
    [billing] = await db.insert(marketplaceBillingRecordsTable).values({ merchantId: merchant.id, listingId: listing.id, kind: "listing", amount: AD_FEE_USD.toFixed(2), currency: "USD", status: "due" }).returning();
  }
  if (!billing) { res.status(500).json({ error: "Advertising fee record could not be created." }); return; }
  let intent = (await db.select().from(paymentIntentsTable).where(eq(paymentIntentsTable.marketplaceBillingRecordId, billing.id)).limit(1))[0];
  if (!intent) {
    const [created] = await db.insert(paymentIntentsTable).values({ merchantId: merchant.id, marketplaceBillingRecordId: billing.id, amountMinor: 500, currency: "USD", method: "flutterwave", idempotencyKey: `marketplace-ad:${billing.id}`, evidenceReference: `TSMKT-AD-${listing.id}-${billing.id}-${randomUUID().replaceAll("-", "").slice(0, 16)}`, status: "created" }).returning();
    intent = created;
  }
  if (!intent) { res.status(409).json({ error: "Advertising payment session could not be created." }); return; }
  const reference = intent.evidenceReference!;
  let destination: Awaited<ReturnType<typeof initializeFlutterwaveVirtualAccount>> | null = null;
  let paymentUrl: string | null = null;
  try {
    if (supportsFlutterwaveDirectBankTransfer("USD")) {
      try {
        destination = await initializeFlutterwaveVirtualAccount({ txRef: reference, amount: AD_FEE_USD, currency: "USD", customer: { email: merchant.email, name: merchant.name }, narration: `TS Commerce product advertising ${listing.id}`, meta: { merchant_id: merchant.id, marketplace_listing_id: listing.id, marketplace_billing_id: billing.id, payment_intent_id: intent.id } });
      } catch { destination = null; }
    }
    if (!destination) {
      const origin = requestOrigin(req);
      if (!origin) throw new Error("Provider return address is unavailable.");
      const hosted = await initializeFlutterwavePayment({ txRef: reference, amount: AD_FEE_USD, currency: "USD", redirectUrl: `${origin}/marketplace-management?advertising=return&listingId=${listing.id}&transaction_id={transaction_id}`, customer: { email: merchant.email, name: merchant.name }, title: "TS Commerce product advertising", meta: { merchant_id: merchant.id, marketplace_listing_id: listing.id, marketplace_billing_id: billing.id, payment_intent_id: intent.id } });
      paymentUrl = hosted.link;
    }
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Advertising checkout could not be prepared." }); return; }
  await db.update(paymentIntentsTable).set({ status: "submitted", checkoutUrl: paymentUrl, evidenceReference: reference }).where(eq(paymentIntentsTable.id, intent.id));
  await db.update(marketplaceBillingRecordsTable).set({ status: "submitted", paymentReference: reference }).where(eq(marketplaceBillingRecordsTable.id, billing.id));
  await db.update(marketplaceListingsTable).set({ listingFeeStatus: "submitted" }).where(eq(marketplaceListingsTable.id, listing.id));
  if (destination) await db.insert(paymentDestinationsTable).values({ merchantId: merchant.id, paymentIntentId: intent.id, provider: "flutterwave", bankName: destination.bankName, accountName: destination.accountName, accountNumber: destination.accountNumber, amountMinor: 500, currency: "USD", providerReference: destination.providerReference ?? reference, expiresAt: destination.expiresAt, status: "active", rawProviderMetadata: destination.raw });
  res.status(201).json({ listingId, billingId: billing.id, paymentIntentId: intent.id, amount: AD_FEE_USD, currency: "USD", paymentUrl, paymentDestination: destination, status: "submitted" });
});

router.post("/marketplace/advertising/:id/verify", async (req, res): Promise<void> => {
  const merchant = await authenticatedMerchant(req);
  if (!merchant) { res.status(401).json({ error: "Merchant authentication is required." }); return; }
  const listingId = Number(req.params.id);
  const transactionId = typeof req.body?.transaction_id === "string" ? req.body.transaction_id.trim() : "";
  if (!Number.isInteger(listingId) || listingId < 1 || !transactionId) { res.status(400).json({ error: "Listing ID and provider transaction ID are required." }); return; }
  const listing = (await db.select().from(marketplaceListingsTable).where(and(eq(marketplaceListingsTable.id, listingId), eq(marketplaceListingsTable.merchantId, merchant.id))).limit(1))[0];
  if (!listing) { res.status(404).json({ error: "Marketplace listing not found." }); return; }
  try {
    const transaction = await verifyFlutterwaveTransaction(transactionId);
    const result = await processVerifiedFlutterwaveTransaction(transaction as unknown as Record<string, unknown>, `merchant-marketplace-verify:${listingId}:${transactionId}`, transaction as unknown as Record<string, unknown>);
    res.json({ status: result, message: result === "successful" || result === "duplicate" ? "Product advertising payment verified." : "The provider has not confirmed this payment yet." });
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "Advertising payment verification failed." }); }
});

export default router;
