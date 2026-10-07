import { db } from "@workspace/db";
import { importPublicSupplierProduct } from "./public-supplier";
import { emitDomainEvent } from "./domain-events";
import { toMinorUnits } from "./money";
import { sql } from "drizzle-orm";

export type SyncPolicy = {
  id: string;
  merchant_id: number;
  supplier_product_id: number;
  enabled: boolean;
  sync_price: boolean;
  sync_stock: boolean;
  sync_variants: boolean;
  sync_media: boolean;
  sync_description: boolean;
  max_price_change_bps: number;
  min_margin_bps: number;
  out_of_stock_action: "pause" | "keep_last" | "draft";
  require_price_review: boolean;
  auto_apply: boolean;
};

type ProductRow = {
  id: number;
  merchant_id: number;
  source_url: string;
  title: string;
  description: string | null;
  image_url: string | null;
  image_urls: unknown;
  video_urls: unknown;
  price: string | null;
  sale_price: string | null;
  currency: string;
  sku: string | null;
  variants: unknown;
  attributes: unknown;
  availability: string | null;
  availability_quantity: number | null;
  inventory_strategy: string;
  inventory_status: string;
  category: string | null;
  tags: unknown;
  specifications: unknown;
  brand: string | null;
  shipping_information: unknown;
  source_metadata: unknown;
  merchant_overrides: unknown;
  pricing_mode: string;
  profit_type: string;
  profit_value: string;
  selling_price: string | null;
  visibility: string;
  status: string;
  import_status: string;
  last_attempted_sync: string | null;
};

type SyncResult = {
  runId: string;
  productId: number;
  status: "completed" | "review_required";
  changedFields: string[];
  reviewReasons: string[];
  source: {
    url: string;
    currency: string;
    price: string | null;
    salePrice: string | null;
    availability: string | null;
    availabilityQuantity: number | null;
  };
  applied: {
    sourceFields: string[];
    merchantFields: string[];
  };
};

function json(value: unknown, fallback: unknown = {}) {
  return value == null ? fallback : value;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function bpsChange(oldMinor: number, nextMinor: number): number {
  if (!Number.isSafeInteger(oldMinor) || oldMinor <= 0) return 100_000;
  return Math.abs(nextMinor - oldMinor) * 10_000 / oldMinor;
}

function percentageOfMinor(minor: number, bps: number): number {
  const result = BigInt(minor) * BigInt(Math.max(0, Math.trunc(bps)));
  return Number(result / 10_000n);
}

function deriveSellingMinor(
  sourceMinor: number,
  pricingMode: string,
  profitType: string,
  profitValue: string,
): number | null {
  if (!Number.isSafeInteger(sourceMinor) || sourceMinor < 0) return null;
  if (pricingMode === "custom") return null;
  const profitMinor = toMinorUnits(profitValue);
  if (pricingMode === "same_price") return sourceMinor;
  if (pricingMode === "fixed_markup") {
    if (profitType === "percentage") return sourceMinor + percentageOfMinor(sourceMinor, profitMinor ?? 0);
    return sourceMinor + Math.max(0, profitMinor ?? 0);
  }
  if (pricingMode === "percentage_markup") {
    return sourceMinor + percentageOfMinor(sourceMinor, Math.max(0, profitMinor ?? 0));
  }
  if (pricingMode === "fixed_margin") {
    const marginBps = Math.max(0, Math.min(9_999, profitMinor ?? 0));
    if (marginBps >= 10_000) return null;
    const numerator = BigInt(sourceMinor) * 10_000n;
    const denominator = BigInt(10_000 - marginBps);
    const roundedUp = (numerator + denominator - 1n) / denominator;
    const value = Number(roundedUp);
    return Number.isSafeInteger(value) ? value : null;
  }
  return null;
}
function hasMerchantOverride(overrides: unknown, field: string): boolean {
  return Boolean(
    overrides &&
    typeof overrides === "object" &&
    !Array.isArray(overrides) &&
    (overrides as Record<string, unknown>)[field] === true,
  );
}

export async function loadSupplierSyncPolicy(merchantId: number, productId: number): Promise<SyncPolicy | null> {
  const result = await db.execute(sql`
    SELECT id,merchant_id,supplier_product_id,enabled,sync_price,sync_stock,sync_variants,
           sync_media,sync_description,max_price_change_bps,min_margin_bps,
           out_of_stock_action,require_price_review,auto_apply
    FROM supplier_sync_policies
    WHERE merchant_id=${merchantId} AND supplier_product_id=${productId}
    LIMIT 1
  `);
  return (result.rows[0] as SyncPolicy | undefined) ?? null;
}

export async function ensurePolicy(merchantId: number, productId: number): Promise<SyncPolicy> {
  const existing = await loadSupplierSyncPolicy(merchantId, productId);
  if (existing) return existing;
  const result = await db.execute(sql`
    INSERT INTO supplier_sync_policies (merchant_id,supplier_product_id)
    VALUES (${merchantId},${productId})
    ON CONFLICT (merchant_id,supplier_product_id)
    DO UPDATE SET updated_at=now()
    RETURNING id,merchant_id,supplier_product_id,enabled,sync_price,sync_stock,sync_variants,
              sync_media,sync_description,max_price_change_bps,min_margin_bps,
              out_of_stock_action,require_price_review,auto_apply
  `);
  const policy = result.rows[0] as SyncPolicy | undefined;
  if (!policy) throw new Error("Supplier sync policy could not be created");
  return policy;
}

function sourceState(imported: Awaited<ReturnType<typeof importPublicSupplierProduct>>) {
  return {
    sourceUrl: imported.sourceUrl,
    sourceDomain: imported.sourceDomain,
    price: imported.price,
    salePrice: imported.salePrice,
    currency: imported.currency,
    sku: imported.sku,
    availability: imported.availability,
    availabilityQuantity: imported.availabilityQuantity,
    variants: imported.variants,
    attributes: imported.attributes,
    imageUrl: imported.imageUrl,
    imageUrls: imported.imageUrls,
    videoUrls: imported.videoUrls,
    description: imported.description,
    shippingInformation: imported.shippingInformation,
  };
}

export async function synchronizeSupplierProduct(input: {
  merchantId: number;
  productId: number;
  triggeredBy?: string;
  policy?: SyncPolicy;
}): Promise<SyncResult> {
  if (!Number.isInteger(input.merchantId) || input.merchantId <= 0) throw new Error("Invalid merchantId");
  if (!Number.isInteger(input.productId) || input.productId <= 0) throw new Error("Invalid supplier product id");

  const policy = input.policy ?? await ensurePolicy(input.merchantId, input.productId);
  if (!policy.enabled) throw new Error("Supplier synchronization is disabled for this product");

  const productResult = await db.execute(sql`
    SELECT id,merchant_id,source_url,title,description,image_url,image_urls,video_urls,price,sale_price,currency,
           sku,variants,attributes,availability,availability_quantity,inventory_strategy,inventory_status,
           category,tags,specifications,brand,shipping_information,source_metadata,merchant_overrides,
           pricing_mode,profit_type,profit_value,selling_price,visibility,status,import_status,last_attempted_sync
    FROM supplier_products
    WHERE id=${input.productId} AND merchant_id=${input.merchantId}
    LIMIT 1
  `);
  const product = productResult.rows[0] as ProductRow | undefined;
  if (!product) throw new Error("Supplier product not found in this merchant workspace");

  const runInsert = await db.execute(sql`
    INSERT INTO supplier_sync_runs (merchant_id,supplier_product_id,policy_id,source_url,status,triggered_by)
    VALUES (${input.merchantId},${input.productId},${policy.id},${product.source_url},'running',${String(input.triggeredBy ?? "system").slice(0,120)})
    RETURNING id
  `);
  const runId = String((runInsert.rows[0] as { id: string }).id);

  try {
    const imported = await importPublicSupplierProduct(product.source_url);
    const before = {
      sourceUrl: product.source_url,
      sourceDomain: new URL(product.source_url).hostname,
      price: product.price,
      salePrice: product.sale_price,
      currency: product.currency,
      sku: product.sku,
      availability: product.availability,
      availabilityQuantity: product.availability_quantity,
      variants: Array.isArray(product.variants) ? product.variants : [],
      attributes: product.attributes ?? {},
      imageUrl: product.image_url,
      imageUrls: Array.isArray(product.image_urls) ? product.image_urls : [],
      videoUrls: Array.isArray(product.video_urls) ? product.video_urls : [],
      description: product.description,
      shippingInformation: product.shipping_information ?? null,
    };
    const changedFields: string[] = [];
    const reviewReasons: string[] = [];
    const sourceFields: string[] = [];
    const merchantFields: string[] = [];

    const incomingSourceMinor = toMinorUnits(imported.salePrice ?? imported.price);
    const currentSourceMinor = toMinorUnits(product.sale_price ?? product.price);

    if (policy.sync_price && incomingSourceMinor !== null && currentSourceMinor !== incomingSourceMinor) {
      changedFields.push("source_price");
      sourceFields.push("price");
    }
    if (policy.sync_stock && (imported.availability !== product.availability || imported.availabilityQuantity !== product.availability_quantity)) {
      changedFields.push("source_availability");
      sourceFields.push("availability");
    }
    if (policy.sync_variants && !sameJson(imported.variants, product.variants)) {
      changedFields.push("variants");
      sourceFields.push("variants");
    }
    if (policy.sync_media && (!sameJson(imported.imageUrls, product.image_urls) || !sameJson(imported.videoUrls, product.video_urls))) {
      changedFields.push("media");
      sourceFields.push("media");
    }
    if (policy.sync_description && imported.description && imported.description !== product.description) {
      changedFields.push("description");
      sourceFields.push("description");
    }

    const merchantOverrides = json(product.merchant_overrides, {});
    const derivedSellingMinor = incomingSourceMinor !== null && imported.currency === product.currency
      ? deriveSellingMinor(incomingSourceMinor, product.pricing_mode, product.profit_type, product.profit_value)
      : null;

    if (policy.sync_price && derivedSellingMinor !== null && !hasMerchantOverride(merchantOverrides, "sellingPrice")) {
      const currentSellingMinor = toMinorUnits(product.selling_price);
      const targetSellingMinor = derivedSellingMinor;
      const marginBps = targetSellingMinor > 0
        ? Math.floor(((targetSellingMinor - (incomingSourceMinor ?? 0)) * 10_000) / targetSellingMinor)
        : 0;
      if (marginBps < policy.min_margin_bps) {
        reviewReasons.push("Proposed selling price would fall below the configured minimum margin.");
        changedFields.push("selling_price_margin_review");
      } else if (currentSellingMinor !== null && currentSellingMinor !== targetSellingMinor) {
        const deltaBps = bpsChange(currentSellingMinor, targetSellingMinor);
        if (deltaBps > policy.max_price_change_bps || policy.require_price_review || !policy.auto_apply) {
          const reasons: string[] = [];
          if (deltaBps > policy.max_price_change_bps) reasons.push("change exceeds configured threshold");
          if (policy.require_price_review) reasons.push("price review is enabled");
          if (!policy.auto_apply) reasons.push("automatic price application is disabled");
          reviewReasons.push("Selling-price change requires review: " + reasons.join("; "));
          changedFields.push("selling_price_review");
        } else {
          merchantFields.push("selling_price");
        }
      } else if (currentSellingMinor === null) {
        if (policy.auto_apply && !policy.require_price_review) merchantFields.push("selling_price");
        else {
          reviewReasons.push("A calculated selling price is available but requires merchant approval.");
          changedFields.push("selling_price_review");
        }
      }
    } else if (policy.sync_price && incomingSourceMinor !== null && imported.currency !== product.currency) {
      reviewReasons.push("Supplier currency changed or differs from merchant selling currency; automatic repricing was blocked.");
      changedFields.push("currency_review");
    }
    if (policy.sync_stock && imported.availability === "out_of_stock") {
      if (policy.out_of_stock_action === "pause") {
        if (product.visibility !== "hidden") merchantFields.push("visibility");
        if (product.status !== "paused") merchantFields.push("status");
      } else if (policy.out_of_stock_action === "draft") {
        if (product.visibility !== "draft") merchantFields.push("visibility");
        if (product.status !== "draft") merchantFields.push("status");
      }
    }

    const afterState = sourceState(imported);
    const runStatus: "completed" | "review_required" =
      reviewReasons.length ? "review_required" : "completed";

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE supplier_products
        SET
          price=${imported.price},
          sale_price=${imported.salePrice},
          currency=${imported.currency},
          sku=${imported.sku},
          availability=${imported.availability},
          availability_quantity=${imported.availabilityQuantity},
          image_url=CASE WHEN ${policy.sync_media} THEN ${imported.imageUrl} ELSE image_url END,
          image_urls=CASE WHEN ${policy.sync_media} THEN ${JSON.stringify(imported.imageUrls)}::jsonb ELSE image_urls END,
          video_urls=CASE WHEN ${policy.sync_media} THEN ${JSON.stringify(imported.videoUrls)}::jsonb ELSE video_urls END,
          variants=CASE WHEN ${policy.sync_variants} THEN ${JSON.stringify(imported.variants)}::jsonb ELSE variants END,
          description=CASE WHEN ${policy.sync_description} AND ${!hasMerchantOverride(merchantOverrides, "description")} THEN ${imported.description} ELSE description END,
          source_metadata=COALESCE(source_metadata,'{}'::jsonb) || ${JSON.stringify(imported.sourceMetadata)}::jsonb,
          inventory_status=CASE
            WHEN ${policy.sync_stock} AND ${imported.availability}='out_of_stock' THEN 'out_of_stock'
            WHEN ${policy.sync_stock} AND ${imported.availability}='in_stock' THEN 'in_stock'
            ELSE inventory_status
          END,
          visibility=CASE
            WHEN ${policy.sync_stock} AND ${imported.availability}='out_of_stock' AND ${policy.out_of_stock_action='pause'} THEN 'hidden'
            WHEN ${policy.sync_stock} AND ${imported.availability}='out_of_stock' AND ${policy.out_of_stock_action='draft'} THEN 'draft'
            ELSE visibility
          END,
          status=CASE
            WHEN ${policy.sync_stock} AND ${imported.availability}='out_of_stock' AND ${policy.out_of_stock_action='pause'} THEN 'paused'
            WHEN ${policy.sync_stock} AND ${imported.availability}='out_of_stock' AND ${policy.out_of_stock_action='draft'} THEN 'draft'
            ELSE status
          END,
          selling_price=CASE
            WHEN ${merchantFields.includes("selling_price")} AND ${derivedSellingMinor !== null} THEN ${(derivedSellingMinor / 100).toFixed(2)}
            ELSE selling_price
          END,
          last_attempted_sync=now(),
          import_status='synced',
          import_error=NULL,
          updated_at=now()
        WHERE id=${product.id} AND merchant_id=${product.merchant_id}
      `);

      await tx.execute(sql`
        UPDATE supplier_sync_policies
        SET last_run_at=now(),updated_at=now()
        WHERE id=${policy.id} AND merchant_id=${input.merchantId}
      `);

      await tx.execute(sql`
        UPDATE supplier_sync_runs
        SET status=${runStatus},
            changed_fields=${JSON.stringify([...new Set(changedFields)])}::jsonb,
            before_state=${JSON.stringify(before)}::jsonb,
            after_state=${JSON.stringify(afterState)}::jsonb,
            provider_snapshot=${JSON.stringify(imported.sourceMetadata)}::jsonb,
            completed_at=now()
        WHERE id=${runId}::uuid AND merchant_id=${input.merchantId}
      `);

      await emitDomainEvent(tx, {
        merchantId: input.merchantId,
        eventType: runStatus === "review_required" ? "supplier.sync_review_required" : "supplier.sync_completed",
        aggregateType: "supplier_product",
        aggregateId: product.id,
        actorType: "system",
        actorId: input.triggeredBy ?? null,
        source: "system",
        idempotencyKey: "supplier-sync:" + product.id + ":" + runId,
        payload: {
          runId,
          changedFields: [...new Set(changedFields)],
          reviewReasons,
          sourceUrl: imported.sourceUrl,
          availability: imported.availability,
          sourcePrice: imported.price,
          sourceCurrency: imported.currency,
        },
        before: {
          price: product.price,
          salePrice: product.sale_price,
          currency: product.currency,
          availability: product.availability,
          availabilityQuantity: product.availability_quantity,
          sellingPrice: product.selling_price,
        },
        after: {
          price: imported.price,
          salePrice: imported.salePrice,
          currency: imported.currency,
          availability: imported.availability,
          availabilityQuantity: imported.availabilityQuantity,
          sellingPrice: merchantFields.includes("selling_price") && derivedSellingMinor !== null
            ? (derivedSellingMinor / 100).toFixed(2)
            : product.selling_price,
        },
      });
    });

    return {
      runId,
      productId: product.id,
      status: runStatus,
      changedFields: [...new Set(changedFields)],
      reviewReasons,
      source: {
        url: imported.sourceUrl,
        currency: imported.currency,
        price: imported.price,
        salePrice: imported.salePrice,
        availability: imported.availability,
        availabilityQuantity: imported.availabilityQuantity,
      },
      applied: { sourceFields, merchantFields },
    };
  } catch (error) {
    await db.execute(sql`
      UPDATE supplier_products
      SET last_attempted_sync=now(),import_status='failed',import_error=${String(error instanceof Error ? error.message : error).slice(0,1000)},updated_at=now()
      WHERE id=${input.productId} AND merchant_id=${input.merchantId}
    `);
    await db.execute(sql`
      UPDATE supplier_sync_runs
      SET status='failed',error_message=${String(error instanceof Error ? error.message : error).slice(0,2000)},completed_at=now()
      WHERE id=${runId}::uuid AND merchant_id=${input.merchantId}
    `);
    throw error;
  }
}

export async function runDueSupplierSyncs(limit = 10): Promise<number> {
  const result = await db.execute(sql`
    SELECT p.id AS policy_id,p.merchant_id,p.supplier_product_id,p.enabled,p.sync_price,p.sync_stock,p.sync_variants,
           p.sync_media,p.sync_description,p.max_price_change_bps,p.min_margin_bps,p.out_of_stock_action,
           p.require_price_review,p.auto_apply
    FROM supplier_sync_policies p
    JOIN supplier_products sp ON sp.id=p.supplier_product_id AND sp.merchant_id=p.merchant_id
    WHERE p.enabled=true
      AND p.auto_apply=true
      AND (p.last_run_at IS NULL OR p.last_run_at < now() - interval '30 minutes')
    ORDER BY p.last_run_at NULLS FIRST
    LIMIT ${Math.max(1, Math.min(limit, 25))}
  `);
  let processed = 0;
  for (const row of result.rows as Array<SyncPolicy>) {
    try {
      await synchronizeSupplierProduct({ merchantId: row.merchant_id, productId: row.supplier_product_id, policy: row, triggeredBy: "supplier_sync_worker" });
      processed += 1;
    } catch {
      // Per-product failure is already persisted. Continue other tenants/products.
    }
  }
  return processed;
}

export function startSupplierSyncWorker(intervalMs = 5 * 60_000) {
  const run = () => { void runDueSupplierSyncs().catch(() => undefined); };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
