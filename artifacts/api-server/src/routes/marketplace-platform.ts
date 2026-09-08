import { randomUUID } from "node:crypto";
import { Router } from "express";
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
const MARKETPLACE_MONTHLY_DAYS = 30;
const PRODUCT_ADVERTISING_FEE_USD = 5;

function originFor(req: any): string {
  const configured = process.env.PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0].trim();
  return host ? `${proto}://${host}` : "";
}

async function currentMerchant(req: any) {
  const auth = getAuth(req);
  if (!auth.userId) return null;
  return (await db.select().from(merchantsTable)
    .where(and(eq(merchantsTable.clerkUserId, auth.userId), eq(merchantsTable.status, "active")))
    .limit(1))[0] ?? null;
}

async function monthlyParticipationIsActive(merchantId: number): Promise<boolean> {
  const [record] = await db.select().from(marketplaceBillingRecordsTable)
    .where(and(
      eq(marketplaceBillingRecordsTable.merchantId, merchantId),
      eq(marketplaceBillingRecordsTable.kind, "monthly"),
      eq(marketplaceBillingRecordsTable.status, "paid"),
      gte(marketplaceBillingRecordsTable.paidAt, new Date(Date.now() - MARKETPLACE_MONTHLY_DAYS * 86_400_000)),
    ))
    .orderBy(desc(marketplaceBillingRecordsTable.paidAt))
    .limit(1);
  return Boolean(record);
}

async function getDiscoveryRows(input: {
  search?: string;
  category?: string;
  currency?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  limit?: number;
}) {
  const search = input.search?.trim().slice(0, 120) ?? "";
  const category = input.category?.trim().slice(0, 120) ?? "";
  const currency = input.currency?.trim().toUpperCase().slice(0, 3) ?? "";
  const filters = [
    eq(merchantsTable.status, "active"),
    eq(supplierProductsTable.status, "active"),
    eq(supplierProductsTable.visibility, "active"),
    eq(marketplaceListingsTable.status, "approved"),
    eq(marketplaceListingsTable.listingFeeStatus, "paid"),
    exists(
      db.select({ id: marketplaceBillingRecordsTable.id })
        .from(marketplaceBillingRecordsTable)
        .where(and(
          eq(marketplaceBillingRecordsTable.merchantId, merchantsTable.id),
          eq(marketplaceBillingRecordsTable.kind, "monthly"),
          eq(marketplaceBillingRecordsTable.status, "paid"),
          gte(marketplaceBillingRecordsTable.paidAt, new Date(Date.now() - MARKETPLACE_MONTHLY_DAYS * 86_400_000)),
        )),
    ),
    sql`${supplierProductsTable.sellingPrice} is not null`,
    or(
      sql`${marketplaceListingsTable.advertising_expires_at} is null`,
      gte(sql`${marketplaceListingsTable.advertising_expires_at}`, new Date()),
    ),
  ];
  if (search) filters.push(or(
    ilike(supplierProductsTable.title, `%${search}%`),
    ilike(supplierProductsTable.description, `%${search}%`),
  )!);
  if (category) filters.push(eq(supplierProductsTable.category, category));
  if (currency) filters.push(eq(supplierProductsTable.currency, currency));
  if (Number.isFinite(input.minPrice ?? NaN)) filters.push(gte(supplierProductsTable.sellingPrice, String(input.minPrice)));
  if (Number.isFinite(input.maxPrice ?? NaN)) filters.push(sql`${supplierProductsTable.sellingPrice} <= ${Number(input.maxPrice).toFixed(2)}`);

  return db.select({
    product: supplierProductsTable,
    listing: marketplaceListingsTable,
    merchantKey: merchantsTable.publicStoreKey,
    merchantName: merchantsTable.storeName,
  })
    .from(marketplaceListingsTable)
    .innerJoin(supplierProductsTable, eq(marketplaceListingsTable.supplierProductId, supplierProductsTable.id))
    .innerJoin(merchantsTable, eq(marketplaceListingsTable.merchantId, merchantsTable.id))
    .where(and(...filters))
    .orderBy(desc(marketplaceListingsTable.advertising_started_at), desc(supplierProductsTable.publishedAt), desc(supplierProductsTable.importedAt))
    .limit(Math.min(100, Math.max(1, input.limit ?? 48)));
}

router.get("/shop/discovery", async (req, res): Promise<void> => {
  const minPrice = typeof req.query.minPrice === "string" ? Number(req.query.minPrice) : null;
  const maxPrice = typeof req.query.maxPrice === "string" ? Number(req.query.maxPrice) : null;
  const rows = await getDiscoveryRows({
    search: typeof req.query.search === "string" ? req.query.search : "",
    category: typeof req.query.category === "string" ? req.query.category : "",
    currency: typeof req.query.currency === "string" ? req.query.currency : "",
    minPrice: Number.isFinite(minPrice ?? NaN) ? minPrice : null,
    maxPrice: Number.isFinite(maxPrice ?? NaN) ? maxPrice : null,
    limit: typeof req.query.limit === "string" ? Number(req.query.limit) : 48,
  });

  const categories = [...new Set(rows.map(({ product }) => product.category).filter(Boolean))].slice(0, 30);
  res.json({
    generatedAt: new Date().toISOString(),
    model: "marketplace-discovery-v1",
    categories,
    products: rows.map(({ product, listing, merchantKey, merchantName }) => ({
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
      advertisingFeeStatus: listing.listingFeeStatus,
      advertisedUntil: listing.advertising_expires_at ?? null,
      storeUrl: merchantKey ? `/store/${merchantKey}` : null,
      productUrl: merchantKey ? `/checkout/${merchantKey}?productId=${product.id}` : null,
    })),
  });
});

router.get("/shop/products/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }
  const rows = await getDiscoveryRows({ limit: 100 });
  const row = rows.find(({ product }) => product.id === id);
  if (!row) {
    res.status(404).json({ error: "Product is not currently available in the shopper marketplace" });
    return;
  }
  const related = rows.filter(({ product }) => product.id !== id && product.category && product.category === row.product.category).slice(0, 8);
  res.json({
    product: {
      id: row.product.id,
      merchantKey: row.merchantKey,
      merchantName: row.merchantName || "Independent merchant",
      title: row.product.title,
      description: row.product.description,
      imageUrl: row.product.imageUrl,
      price: Number(row.product.sellingPrice),
      currency: row.product.currency,
      category: row.product.category,
      brand: row.product.brand,
      availability: row.product.availability,
      availabilityQuantity: row.product.availabilityQuantity,
      sponsored: true,
    },
    related: related.map(({ product, merchantKey, merchantName }) => ({
      id: product.id,
      merchantKey,
      merchantName: merchantName || "Independent merchant",
      title: product.title,
      imageUrl: product.imageUrl,
      price: Number(product.sellingPrice),
      currency: product.currency,
      category: product.category,
    })),
  });
});

router.post("/shop/ai-concierge", async (req, res): Promise<void> => {
  const query = typeof req.body?.query === "string" ? req.body.query.trim().slice(0, 1000) : "";
  if (query.length < 3) {
    res.status(400).json({ error: "Tell the shopping concierge what you are looking for." });
    return;
  }
  try {
    const rows = await getDiscoveryRows({ search: "", limit: 40 });
    const catalog = rows.map(({ product, merchantName }) => ({
      id: product.id,
      merchant: merchantName,
      title: product.title,
      description: product.description,
      category: product.category,
      price: Number(product.sellingPrice),
      currency: product.currency,
    }));
    const response = await completeGeminiChat([
      {
        role: "system",
        content: [
          "You are the TS Commerce shopper concierge.",
          "Recommend only products present in the supplied marketplace catalog.",
          "Do not invent availability, discounts, specifications, delivery promises, seller claims, or prices.",
          "Return ONLY JSON: {\"recommendations\":[{\"id\":number,\"reason\":string}],\"summary\":string}.",
          "Return at most 6 recommendations.",
          "Reasons must be concise and based only on catalog facts and the shopper request.",
          `Marketplace catalog: ${JSON.stringify(catalog)}`,
        ].join("\n"),
      },
      { role: "user", content: query },
    ]);
    const raw = response.content.trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(raw) as { recommendations?: unknown; summary?: unknown };
    const byId = new Map(catalog.map((item) => [item.id, item]));
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.map((item) => item && typeof item === "object" ? item as Record<string, unknown> : null).filter(Boolean).slice(0, 6)
        .map((item) => {
          const product = byId.get(Number(item!.id));
          if (!product) return null;
          return {
            ...product,
            reason: String(item!.reason ?? "Relevant to your request").slice(0, 260),
            sponsored: true,
            productUrl: rows.find(({ product: p }) => p.id === product.id)?.merchantKey ? `/checkout/${rows.find(({ product: p }) => p.id === product.id)!.merchantKey}?productId=${product.id}` : null,
          };
        }).filter(Boolean)
      : [];
    res.json({ summary: String(parsed.summary ?? "Here are products that best match your request.").slice(0, 500), recommendations, model: response.model });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Shopping concierge is temporarily unavailable." });
  }
});

router.post("/marketplace/advertising/:id/checkout", async (req, res): Promise<void> => {
  const merchant = await currentMerchant(req);
  if (!merchant) { res.status(401).json({ error: "Merchant authentication is required." }); return; }
  const listingId = Number(req.params.id);
  if (!Number.isInteger(listingId) || listingId < 1) { res.status(400).json({ error: "Invalid marketplace listing." }); return; }
  if (!isFlutterwaveConfigured()) { res.status(503).json({ error: "Flutterwave advertising payments are not configured." }); return; }

  const listing = (await db.select().from(marketplaceListingsTable).where(and(
    eq(marketplaceListingsTable.id, listingId),
    eq(marketplaceListingsTable.merchantId, merchant.id),
  )).limit(1))[0];
  if (!listing) { res.status(404).json({ error: "Marketplace listing not found." }); return; }
  if (listing.status !== "approved") { res.status(409).json({ error: "The product must be approved before it can be promoted." }); return; }
  if (listing.listingFeeStatus === "paid") {
    res.json({ status: "paid", listingId, message: "This product's advertising fee is already verified." }); return;
  }

  let [billing] = await db.select().from(marketplaceBillingRecordsTable).where(and(
    eq(marketplaceBillingRecordsTable.merchantId, merchant.id),
    eq(marketplaceBillingRecordsTable.listingId, listing.id),
    eq(marketplaceBillingRecordsTable.kind, "listing"),
  )).orderBy(desc(marketplaceBillingRecordsTable.createdAt)).limit(1);

  if (!billing || billing.status === "rejected" || billing.status === "reversed") {
    [billing] = await db.insert(marketplaceBillingRecordsTable).values({
      merchantId: merchant.id,
      listingId: listing.id,
      kind: "listing",
      amount: PRODUCT_ADVERTISING_FEE_USD.toFixed(2),
      currency: "USD",
      status: "due",
    }).returning();
  }
  if (!billing) { res.status(500).json({ error: "Advertising billing record could not be prepared." }); return; }

  const existing = (await db.select().from(paymentIntentsTable).where(eq(paymentIntentsTable.marketplaceBillingRecordId, billing.id)).limit(1))[0];
  const intent = existing ?? (await db.transaction(async (tx) => {
    const txRef = `TSMKT-AD-${listing.id}-${billing!.id}-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const [created] = await tx.insert(paymentIntentsTable).values({
      merchantId: merchant.id,
      marketplaceBillingRecordId: billing!.id,
      amountMinor: 500,
      currency: "USD",
      method: "flutterwave",
      idempotencyKey: `marketplace-ad:${billing!.id}`,
      evidenceReference: txRef,
      status: "created",
    }).returning();
    return created;
  }));
  if (!intent) { res.status(409).json({ error: "Advertising payment session could not be created." }); return; }

  const ref = intent.evidenceReference ?? `TSMKT-AD-${listing.id}-${billing.id}`;
  let purchaseUrl: string | null = null;
  let destination: Awaited<ReturnType<typeof initializeFlutterwaveVirtualAccount>> | null = null;
  try {
    if (supportsFlutterwaveDirectBankTransfer("USD")) {
      try {
        destination = await initializeFlutterwaveVirtualAccount({
          txRef: ref,
          amount: 5,
          currency: "USD",
          customer: { email: merchant.email, name: merchant.name },
          narration: `TS Commerce product advertising ${listing.id}`,
          meta: { provider: "flutterwave", merchant_id: merchant.id, marketplace_listing_id: listing.id, marketplace_billing_id: billing.id, payment_intent_id: intent.id },
        });
      } catch {
        destination = null;
      }
    }
    if (!destination) {
      const origin = originFor(req);
      if (!origin) throw new Error("Provider return address is not configured");
      const hosted = await initializeFlutterwavePayment({
        txRef: ref,
        amount: 5,
        currency: "USD",
        redirectUrl: `${origin}/marketplace-management?advertising=return&listingId=${listing.id}&transaction_id={transaction_id}`,
        customer: { email: merchant.email, name: merchant.name },
        title: "TS Commerce product advertising",
        meta: { provider: "flutterwave", merchant_id: merchant.id, marketplace_listing_id: listing.id, marketplace_billing_id: billing.id, payment_intent_id: intent.id },
      });
      purchaseUrl = hosted.link;
    }
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Advertising checkout could not be prepared." });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(paymentIntentsTable).set({ status: "submitted", evidenceReference: ref, checkoutUrl: purchaseUrl }).where(eq(paymentIntentsTable.id, intent.id));
    await tx.update(marketplaceBillingRecordsTable).set({ status: "submitted", paymentReference: ref }).where(eq(marketplaceBillingRecordsTable.id, billing.id));
    await tx.update(marketplaceListingsTable).set({ listingFeeStatus: "submitted" }).where(eq(marketplaceListingsTable.id, listing.id));
    if (destination) {
      await tx.insert(paymentDestinationsTable).values({
        merchantId: merchant.id,
        paymentIntentId: intent.id,
        provider: "flutterwave",
        bankName: destination.bankName,
        accountName: destination.accountName,
        accountNumber: destination.accountNumber,
        amountMinor: 500,
        currency: "USD",
        providerReference: destination.providerReference ?? ref,
        expiresAt: destination.expiresAt,
        status: "active",
        rawProviderMetadata: destination.raw,
      });
    }
  });

  res.status(201).json({
    listingId,
    billingId: billing.id,
    paymentIntentId: intent.id,
    amount: 5,
    currency: "USD",
    paymentUrl: purchaseUrl,
    paymentDestination: destination,
    status: "submitted",
  });
});

router.post("/marketplace/advertising/:id/verify", async (req, res): Promise<void> => {
  const merchant = await currentMerchant(req);
  if (!merchant) { res.status(401).json({ error: "Merchant authentication is required." }); return; }
  const listingId = Number(req.params.id);
  const transactionId = typeof req.body?.transaction_id === "string" ? req.body.transaction_id.trim() : "";
  if (!Number.isInteger(listingId) || listingId < 1 || !transactionId) { res.status(400).json({ error: "Listing ID and provider transaction ID are required." }); return; }
  const listing = (await db.select().from(marketplaceListingsTable).where(and(eq(marketplaceListingsTable.id, listingId), eq(marketplaceListingsTable.merchantId, merchant.id))).limit(1))[0];
  if (!listing) { res.status(404).json({ error: "Marketplace listing not found." }); return; }
  try {
    const transaction = await verifyFlutterwaveTransaction(transactionId);
    const result = await processVerifiedFlutterwaveTransaction(
      transaction as unknown as Record<string, unknown>,
      `marketplace-merchant-verify:${listingId}:${transactionId}`,
      transaction as unknown as Record<string, unknown>,
    );
    res.json({ status: result, message: result === "successful" || result === "duplicate" ? "Product advertising payment verified." : "The provider payment is not confirmed yet." });
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "Advertising payment verification failed." });
  }
});

export default router;
