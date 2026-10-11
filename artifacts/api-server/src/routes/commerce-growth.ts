import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getAuth } from "../lib/auth-compat";
import { requirePermission } from "../lib/tenant-access";
import { emitDomainEvent } from "../lib/domain-events";
import { readLatestStoredFxRateSet } from "../lib/fx-rate-worker";
import { importPublicSupplierProduct } from "../lib/public-supplier";
import { enrichSupplierProduct } from "../lib/supplier-ai";
import { normalizeSupplierStock } from "../lib/supplier-sync-policy";
import { currencyMinorUnitExponent, parseStorefrontId, parseSupplierProductId, quoteProductAdvertisingFee } from "../lib/commerce-growth-policy";
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
  ledgerEntriesTable,
  subscriptionsTable,
  withdrawalsTable,
  activityTable,
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

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function stringValue(value: unknown, max = 2000): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}
function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function sourcePriceMinor(value: unknown): number | null {
  const amount = numberValue(value);
  if (amount === null) return null;
  const minor = Math.round(amount * 100);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
function sourceQualityCompleteness(product: { title: string; description: string | null; price: string | null; imageUrl: string | null; imageUrls: string[]; variants: unknown[]; specifications: Record<string, string> }): number {
  const checks: Array<[boolean, number]> = [
    [Boolean(product.title), 25],
    [Boolean(product.description), 15],
    [Boolean(product.price), 15],
    [Boolean(product.imageUrl || product.imageUrls.length), 15],
    [product.variants.length > 0, 15],
    [Object.keys(product.specifications).length > 0, 15],
  ];
  return checks.reduce((total, [present, weight]) => total + (present ? weight : 0), 0);
}


router.post("/growth/sourcing/sources", async (req, res, next) => {
  try {
    const actorId = getAuth(req).userId;
    const merchantId = await merchantIdFor(req);
    const url = cleanUrl(req.body?.sourceUrl);
    url.hash = "";
    const requestedUrl = url.toString();

    const existingSource = (await db.select().from(sourcingSourcesTable).where(and(
      eq(sourcingSourcesTable.merchantId, merchantId),
      or(eq(sourcingSourcesTable.sourceUrl, requestedUrl), eq(sourcingSourcesTable.canonicalUrl, requestedUrl)),
    )).limit(1))[0];
    if (existingSource) {
      const existingProduct = (await db.select().from(sourcingProductsTable).where(and(
        eq(sourcingProductsTable.merchantId, merchantId),
        eq(sourcingProductsTable.sourceId, existingSource.id),
      )).limit(1))[0] ?? null;
      res.status(200).json({
        source: existingSource,
        product: existingProduct,
        alreadyExists: true,
        message: existingProduct
          ? "This source has already been extracted. Review the existing product or refresh the supplier through the catalog."
          : "This source is registered but has no extracted product yet.",
      });
      return;
    }

    // Fetch through the hardened public-supplier transport: DNS/IP pinning, redirect revalidation,
    // response limits and image safety are enforced there before evidence is persisted.
    let extracted;
    try {
      extracted = await enrichSupplierProduct(await importPublicSupplierProduct(requestedUrl));
    } catch (error) {
      res.status(422).json({
        error: error instanceof Error ? error.message : "Supplier page could not be extracted",
        retryable: true,
      });
      return;
    }
    const domain = new URL(extracted.sourceUrl).hostname.toLowerCase();
    const currency = extracted.currency.trim().toUpperCase();
    const observedPrice = extracted.salePrice ?? extracted.price;
    const priceMinor = sourcePriceMinor(observedPrice);
    const media = [...new Set([extracted.imageUrl, ...extracted.imageUrls].filter((value): value is string => typeof value === "string" && value.length > 0))];
    const normalizedData = {
      sourceUrl: extracted.sourceUrl,
      sourceDomain: extracted.sourceDomain,
      title: extracted.title,
      description: extracted.description,
      imageUrl: extracted.imageUrl,
      imageUrls: extracted.imageUrls,
      videoUrls: extracted.videoUrls,
      price: extracted.price,
      salePrice: extracted.salePrice,
      currency,
      sku: extracted.sku,
      sourceProductId: extracted.sourceProductId,
      availability: extracted.availability,
      availabilityQuantity: extracted.availabilityQuantity,
      category: extracted.category,
      attributes: extracted.attributes,
      specifications: extracted.specifications,
      brand: extracted.brand,
      shippingInformation: extracted.shippingInformation,
      sourceMetadata: extracted.sourceMetadata,
    };

    const result = await db.transaction(async (tx) => {
      const [created] = await tx.insert(sourcingSourcesTable).values({
        merchantId,
        sourceUrl: requestedUrl,
        canonicalUrl: extracted.sourceUrl,
        domain,
        sourceType: "product_url",
        status: "active",
        lastCheckedAt: new Date(),
      }).returning();
      if (!created) throw new Error("Supplier source could not be registered");

      const [discovered] = await tx.insert(sourcingProductsTable).values({
        merchantId,
        sourceId: created.id,
        sourceProductKey: extracted.sourceProductId ?? extracted.sku ?? extracted.sourceUrl,
        title: extracted.title.slice(0, 240),
        description: extracted.description,
        sourceCurrency: currency,
        sourcePriceMinor: priceMinor,
        sourceAvailability: extracted.availability,
        sourceSku: extracted.sku,
        variants: extracted.variants,
        media,
        specifications: extracted.specifications,
        normalizedData,
        status: "review",
      }).returning();
      if (!discovered) throw new Error("Extracted supplier product could not be saved");

      if (priceMinor !== null) {
        await tx.insert(sourcingPriceSnapshotsTable).values({
          sourcingProductId: discovered.id,
          sourcePriceMinor: priceMinor,
          currency,
          availability: extracted.availability,
          capturedAt: new Date(),
        });
      }
      await emitDomainEvent(tx, {
        merchantId,
        eventType: "sourcing.source_registered",
        aggregateType: "sourcing_source",
        aggregateId: created.id,
        actorType: "merchant",
        actorId: actorId ?? null,
        source: "merchant_api",
        idempotencyKey: "sourcing-source-registered:" + created.id,
        payload: { sourceId: created.id, domain, sourceType: created.sourceType },
        after: { sourceId: created.id, domain, sourceType: created.sourceType },
      });
      await emitDomainEvent(tx, {
        merchantId,
        eventType: "sourcing.product_discovered",
        aggregateType: "sourcing_product",
        aggregateId: discovered.id,
        actorType: "merchant",
        actorId: actorId ?? null,
        source: "merchant_api",
        idempotencyKey: "sourcing-product-discovered:" + discovered.id,
        payload: {
          sourcingProductId: discovered.id,
          sourceId: created.id,
          title: discovered.title,
          sourceDomain: domain,
          sourcePriceMinor: priceMinor,
          currency,
          status: discovered.status,
          qualityCompletenessScore: sourceQualityCompleteness({
            title: extracted.title,
            description: extracted.description,
            price: observedPrice,
            imageUrl: extracted.imageUrl,
            imageUrls: extracted.imageUrls,
            variants: extracted.variants,
            specifications: extracted.specifications,
          }),
        },
        after: { status: discovered.status, sourcePriceMinor: priceMinor, currency },
      });
      return { source: created, product: discovered };
    });
    res.status(201).json({
      ...result,
      alreadyExists: false,
      message: "Supplier page extracted and saved for review. Import it into your catalog only after checking the source facts and selling price.",
    });
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

router.post("/growth/sourcing/products/:id/import", async (req, res, next) => {
  try {
    const actorId = getAuth(req).userId;
    const merchantId = await merchantIdFor(req);
    const sourcingProductId = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sourcingProductId)) {
      res.status(400).json({ error: "Invalid sourcing product ID" }); return;
    }

    const result = await db.transaction(async (tx) => {
      const sourceProduct = (await tx.select().from(sourcingProductsTable).where(and(
        eq(sourcingProductsTable.id, sourcingProductId),
        eq(sourcingProductsTable.merchantId, merchantId),
      )).limit(1))[0];
      if (!sourceProduct) return { error: "Sourcing product not found", statusCode: 404 as const };
      if (sourceProduct.importedProductId !== null) {
        const existingCatalogProduct = (await tx.select().from(supplierProductsTable).where(and(
          eq(supplierProductsTable.id, sourceProduct.importedProductId),
          eq(supplierProductsTable.merchantId, merchantId),
        )).limit(1))[0];
        if (existingCatalogProduct) return { product: existingCatalogProduct, alreadyImported: true };
        return { error: "The linked catalog record is missing; contact support before retrying.", statusCode: 409 as const };
      }

      const source = (await tx.select().from(sourcingSourcesTable).where(and(
        eq(sourcingSourcesTable.id, sourceProduct.sourceId),
        eq(sourcingSourcesTable.merchantId, merchantId),
      )).limit(1))[0];
      if (!source) return { error: "The supplier source for this product could not be found.", statusCode: 409 as const };

      const normalized = objectValue(sourceProduct.normalizedData);
      const sourceUrl = source.canonicalUrl ?? source.sourceUrl;
      let parsedUrl: URL;
      try { parsedUrl = new URL(sourceUrl); } catch { return { error: "The saved supplier URL is invalid.", statusCode: 409 as const }; }
      const currency = String(sourceProduct.sourceCurrency ?? "").trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) return { error: "A valid source currency is required before catalog import.", statusCode: 422 as const };
      const originalPrice = numberValue(normalized.price);
      const originalSalePrice = numberValue(normalized.salePrice);
      const stockQuantity = numberValue(normalized.availabilityQuantity);
      const quantity = stockQuantity !== null && Number.isSafeInteger(stockQuantity) ? stockQuantity : null;
      const inventory = normalizeSupplierStock(sourceProduct.sourceAvailability, quantity);
      const firstImage = Array.isArray(sourceProduct.media) ? sourceProduct.media.find((item) => typeof item === "string") as string | undefined : undefined;
      const imageUrl = stringValue(normalized.imageUrl, 2048) ?? firstImage ?? null;
      const imageUrls = Array.isArray(sourceProduct.media) ? sourceProduct.media.filter((item): item is string => typeof item === "string").slice(0, 50) : [];
      const [createdProduct] = await tx.insert(supplierProductsTable).values({
        merchantId,
        supplierId: null,
        sourceUrl,
        supplierUrl: parsedUrl.origin,
        sourceDomain: source.domain ?? parsedUrl.hostname,
        sourceProductId: stringValue(normalized.sourceProductId, 200),
        title: sourceProduct.title.slice(0, 240),
        description: sourceProduct.description,
        imageUrl,
        imageUrls,
        videoUrls: Array.isArray(normalized.videoUrls) ? normalized.videoUrls.filter((item) => typeof item === "string").slice(0, 20) : [],
        price: originalPrice !== null ? originalPrice.toFixed(2) : null,
        salePrice: originalSalePrice !== null ? originalSalePrice.toFixed(2) : null,
        currency,
        sku: sourceProduct.sourceSku,
        variants: Array.isArray(sourceProduct.variants) ? sourceProduct.variants : [],
        attributes: objectValue(normalized.attributes),
        availability: sourceProduct.sourceAvailability,
        availabilityQuantity: inventory.availabilityQuantity,
        inventoryStrategy: "source_based",
        inventoryStatus: inventory.inventoryStatus,
        category: stringValue(normalized.category, 160),
        tags: [],
        specifications: objectValue(sourceProduct.specifications),
        brand: stringValue(normalized.brand, 160),
        shippingInformation: objectValue(normalized.shippingInformation),
        sourceMetadata: { ...normalized, sourcingProductId: sourceProduct.id, sourceId: source.id, extractionMethod: "public_supplier_page" },
        merchantOverrides: {},
        profitType: "fixed",
        pricingMode: "fixed_markup",
        profitValue: "0.00",
        sellingPrice: null,
        status: "draft",
        visibility: "draft",
        importStatus: "imported",
      }).returning();
      if (!createdProduct) throw new Error("Catalog product could not be created");

      const [linked] = await tx.update(sourcingProductsTable).set({
        importedProductId: createdProduct.id,
        status: "imported",
      }).where(and(
        eq(sourcingProductsTable.id, sourceProduct.id),
        eq(sourcingProductsTable.merchantId, merchantId),
        isNull(sourcingProductsTable.importedProductId),
      )).returning();
      if (!linked) throw new Error("This sourcing product was imported concurrently; retry to load the existing catalog product");

      await emitDomainEvent(tx, {
        merchantId,
        eventType: "catalog.product_changed",
        aggregateType: "supplier_product",
        aggregateId: createdProduct.id,
        actorType: "merchant",
        actorId: actorId ?? null,
        source: "merchant_api",
        idempotencyKey: "catalog-product-from-sourcing:" + createdProduct.id,
        payload: {
          productId: createdProduct.id,
          sourcingProductId: sourceProduct.id,
          sourceId: source.id,
          status: createdProduct.status,
          visibility: createdProduct.visibility,
          currency: createdProduct.currency,
          sourceDomain: createdProduct.sourceDomain,
        },
        after: { status: "draft", visibility: "draft" },
      });
      return { product: createdProduct, alreadyImported: false };
    });
    if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
    res.status(result.alreadyImported ? 200 : 201).json({
      product: result.product,
      alreadyImported: result.alreadyImported,
      message: result.alreadyImported ? "This sourcing product is already linked to the catalog." : "Draft catalog product created. Set the selling price and review it before publishing.",
    });
  } catch (error) { next(error); }
});

/**
 * Advertising is intentionally two-step: this endpoint creates a payable
 * campaign only. It cannot manufacture a successful payment or activate paid
 * placement. A verified TS Pay/provider transaction must later attach to it.
 */
router.get("/growth/advertising/eligible-products", async (req, res, next) => {
  try {
    const merchantId = await merchantIdFor(req);
    const products = await db.select({
      id: supplierProductsTable.id,
      title: supplierProductsTable.title,
      currency: supplierProductsTable.currency,
      updatedAt: supplierProductsTable.updatedAt,
    }).from(supplierProductsTable).where(and(
      eq(supplierProductsTable.merchantId, merchantId),
      eq(supplierProductsTable.status, "active"),
      eq(supplierProductsTable.visibility, "active"),
    )).orderBy(desc(supplierProductsTable.updatedAt)).limit(200);
    res.json({ products });
  } catch (error) { next(error); }
});

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

router.post("/growth/advertising/campaigns/:id/pay-from-earnings", async (req, res, next) => {
  try {
    const actorId = getAuth(req).userId;
    const merchantId = await merchantIdFor(req);
    const campaignId = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(campaignId)) {
      res.status(400).json({ error: "Invalid advertising campaign ID" }); return;
    }

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM merchants WHERE id = ${merchantId} FOR UPDATE`);
      await tx.execute(sql`SELECT id FROM product_advertising_campaigns WHERE id = ${campaignId} AND merchant_id = ${merchantId} FOR UPDATE`);
      const campaign = (await tx.select().from(productAdvertisingCampaignsTable).where(and(
        eq(productAdvertisingCampaignsTable.id, campaignId),
        eq(productAdvertisingCampaignsTable.merchantId, merchantId),
      )).limit(1))[0];
      if (!campaign) return { error: "Advertising campaign not found", statusCode: 404 as const };
      if (campaign.paymentStatus === "confirmed" && campaign.status === "active") {
        return { campaign, alreadyPaid: true };
      }
      if (campaign.paymentStatus !== "pending" || campaign.status !== "awaiting_payment") {
        return { error: "This campaign is not awaiting a new earnings payment", statusCode: 409 as const };
      }
      const merchant = (await tx.select({ currency: merchantsTable.currency }).from(merchantsTable)
        .where(eq(merchantsTable.id, merchantId)).limit(1))[0];
      if (!merchant?.currency || merchant.currency.toUpperCase() !== campaign.currency.toUpperCase()) {
        return { error: "Campaign currency no longer matches the merchant settlement currency; request a new quote.", statusCode: 409 as const };
      }
      if (!Number.isSafeInteger(campaign.feeMinor) || campaign.feeMinor <= 0) {
        return { error: "Campaign fee is invalid; it was not charged.", statusCode: 409 as const };
      }

      const [balance] = await tx.select({
        total: sql<string>`coalesce(sum(${ledgerEntriesTable.amountMinor}), 0)`,
      }).from(ledgerEntriesTable).where(and(
        eq(ledgerEntriesTable.merchantId, merchantId),
        eq(ledgerEntriesTable.currency, campaign.currency),
      ));
      const subscription = (await tx.select().from(subscriptionsTable).where(eq(subscriptionsTable.merchantId, merchantId)).limit(1))[0];
      const [withdrawalReserve] = await tx.select({
        total: sql<string>`coalesce(sum(${withdrawalsTable.amount}), 0)`,
      }).from(withdrawalsTable).where(and(
        eq(withdrawalsTable.merchantId, merchantId),
        eq(withdrawalsTable.currency, campaign.currency),
        inArray(withdrawalsTable.status, ["pending", "approved", "paid"]),
      ));
      const exponent = currencyMinorUnitExponent(campaign.currency);
      const scale = 10 ** exponent;
      const ledgerMinor = Number(balance?.total ?? 0);
      const subscriptionReserveMinor = subscription?.currency === campaign.currency
        ? Math.round(Number(subscription.earningsHeld ?? 0) * scale) : 0;
      const withdrawalReserveMinor = Math.round(Number(withdrawalReserve?.total ?? 0) * scale);
      const availableMinor = ledgerMinor - subscriptionReserveMinor - withdrawalReserveMinor;
      if (!Number.isSafeInteger(availableMinor) || availableMinor < campaign.feeMinor) {
        return { error: `Insufficient available ${campaign.currency} earnings to pay this campaign. No charge was made.`, statusCode: 409 as const };
      }

      const referenceKey = `product-ad-campaign:${campaign.id}:payment`;
      const existingEntry = (await tx.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.referenceKey, referenceKey)).limit(1))[0];
      if (existingEntry) {
        return { error: "A prior campaign ledger entry exists without a confirmed campaign payment; reconciliation is required.", statusCode: 409 as const };
      }
      const [entry] = await tx.insert(ledgerEntriesTable).values({
        merchantId,
        amountMinor: -campaign.feeMinor,
        currency: campaign.currency,
        entryType: "advertising",
        referenceKey,
      }).onConflictDoNothing({ target: ledgerEntriesTable.referenceKey }).returning();
      if (!entry) return { error: "Campaign payment could not be reserved idempotently; reload and retry.", statusCode: 409 as const };

      const reference = "EARN-PRODUCT-AD-" + campaign.id;
      const [updated] = await tx.update(productAdvertisingCampaignsTable).set({
        paymentStatus: "confirmed",
        paymentReference: reference,
        status: "active",
        startsAt: new Date(),
      }).where(and(
        eq(productAdvertisingCampaignsTable.id, campaign.id),
        eq(productAdvertisingCampaignsTable.merchantId, merchantId),
        eq(productAdvertisingCampaignsTable.paymentStatus, "pending"),
        eq(productAdvertisingCampaignsTable.status, "awaiting_payment"),
      )).returning();
      if (!updated) throw new Error("Campaign changed concurrently; payment transaction was rolled back");

      const amountMajor = campaign.feeMinor / scale;
      await tx.insert(activityTable).values({
        merchantId,
        type: "advertising_payment",
        title: "Product advertising campaign paid from earnings",
        description: "Product campaign " + campaign.id + " was paid from available merchant earnings.",
        amount: (-amountMajor).toFixed(exponent),
        currency: campaign.currency,
        tone: "negative",
      });
      await emitDomainEvent(tx, {
        merchantId,
        eventType: "advertising.payment_confirmed",
        aggregateType: "product_advertising_campaign",
        aggregateId: campaign.id,
        actorType: "merchant",
        actorId: actorId ?? null,
        source: "merchant_api",
        idempotencyKey: "product-ad-campaign:" + campaign.id + ":confirmed",
        payload: { campaignId: campaign.id, amountMinor: campaign.feeMinor, currency: campaign.currency, method: "earnings" },
        before: { paymentStatus: campaign.paymentStatus, status: campaign.status },
        after: { paymentStatus: updated.paymentStatus, status: updated.status },
      });
      return { campaign: updated, alreadyPaid: false };
    });
    if ("error" in result) { res.status(result.statusCode).json({ error: result.error }); return; }
    res.status(result.alreadyPaid ? 200 : 201).json({
      campaign: result.campaign,
      alreadyPaid: result.alreadyPaid,
      message: result.alreadyPaid ? "This campaign was already paid." : "Campaign payment was posted to the merchant ledger and paid placement is now eligible.",
    });
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
