import { and, inArray, sql } from "drizzle-orm";
import { db, supplierImportAttemptsTable, supplierProductsTable } from "@workspace/db";
import { importPublicSupplierProduct } from "./public-supplier";
import { calculateSupplierSellingPrice } from "./supplier-pricing";
import { normalizeSupplierStock } from "./supplier-sync-policy";
import { emitDomainEvent } from "./domain-events";
import { recommendDynamicPrice } from "./dynamic-pricing";
import { logger } from "./logger";

const SUPPLIER_SYNC_INTERVAL_MS = 15 * 60_000;
const WORKER_INTERVAL_MS = 60_000;
const BATCH_SIZE = 10;

type SupplierProduct = typeof supplierProductsTable.$inferSelect;
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function overridden(overrides: Record<string, unknown>, ...keys: string[]) {
  return keys.some((key) => overrides[key] === true);
}
function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
function moneyMinor(value: unknown): number | null {
  const amount = numeric(value);
  if (amount === null || amount < 0) return null;
  const minor = Math.round(amount * 100);
  return Number.isSafeInteger(minor) ? minor : null;
}
function sameValue(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
function supplierSyncMeta(product: SupplierProduct) { return record(record(product.sourceMetadata).supplierSync); }

async function claimDueSupplierProducts(): Promise<SupplierProduct[]> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - SUPPLIER_SYNC_INTERVAL_MS);
  return db.transaction(async (tx) => {
    const eligible = await tx.execute(sql`
      SELECT sp.id
      FROM supplier_products sp
      INNER JOIN merchants m ON m.id = sp.merchant_id
      WHERE sp.inventory_strategy = 'synchronized'
        AND sp.status = 'active'
        AND sp.visibility = 'active'
        AND m.status = 'active'
        AND (sp.last_attempted_sync IS NULL OR sp.last_attempted_sync <= ${cutoff})
      ORDER BY sp.last_attempted_sync ASC NULLS FIRST, sp.id ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE OF sp SKIP LOCKED
    `);
    const ids = eligible.rows.map((row) => Number((row as { id?: unknown }).id))
      .filter((id) => Number.isSafeInteger(id) && id > 0);
    if (!ids.length) return [];
    const products = await tx.select().from(supplierProductsTable).where(inArray(supplierProductsTable.id, ids));
    const claimed: SupplierProduct[] = [];
    for (const product of products) {
      const metadata = record(product.sourceMetadata);
      const previousSync = record(metadata.supplierSync);
      const syncingMetadata = {
        ...metadata,
        supplierSync: {
          ...previousSync,
          state: "syncing",
          startedAt: now.toISOString(),
          previousState: previousSync.state ?? null,
        },
      };
      await tx.update(supplierProductsTable)
        .set({ lastAttemptedSync: now, sourceMetadata: syncingMetadata })
        .where(and(eq(supplierProductsTable.id, product.id), eq(supplierProductsTable.merchantId, product.merchantId)));
      claimed.push({ ...product, lastAttemptedSync: now, sourceMetadata: syncingMetadata });
    }
    return claimed;
  });
}

/** Prevent an older network response from overwriting a newer manual refresh or worker claim. */
async function restoreSupersededClaim(tx: any, current: SupplierProduct, claimed: SupplierProduct): Promise<boolean> {
  const latestSync = supplierSyncMeta(current);
  const claimedSync = supplierSyncMeta(claimed);
  if (latestSync.startedAt !== claimedSync.startedAt) return true;
  const lastAttempted = current.lastAttemptedSync instanceof Date ? current.lastAttemptedSync.getTime() : NaN;
  const claimedAt = claimed.lastAttemptedSync instanceof Date ? claimed.lastAttemptedSync.getTime() : NaN;
  if (lastAttempted === claimedAt && current.sourceUrl === claimed.sourceUrl) return false;
  const metadata = record(current.sourceMetadata);
  const previousState = typeof latestSync.previousState === "string" ? latestSync.previousState : "idle";
  const syncFields = { ...latestSync };
  delete syncFields.previousState;
  await tx.update(supplierProductsTable).set({
    sourceMetadata: { ...metadata, supplierSync: { ...syncFields, state: previousState } },
  }).where(eq(supplierProductsTable.id, current.id));
  return true;
}

async function failSupplierSync(claimed: SupplierProduct) {
  const failedAt = new Date();
  await db.transaction(async (tx) => {
    const current = (await tx.select().from(supplierProductsTable).where(and(
      eq(supplierProductsTable.id, claimed.id),
      eq(supplierProductsTable.merchantId, claimed.merchantId),
    )).limit(1))[0];
    if (!current || await restoreSupersededClaim(tx, current, claimed)) return;
    const metadata = record(current.sourceMetadata);
    const sync = supplierSyncMeta(current);
    const syncFields = { ...sync };
    delete syncFields.previousState;
    const sourceMetadata = {
      ...metadata,
      supplierSync: { ...syncFields, state: "failed", lastErrorCode: "supplier_fetch_failed", lastAttemptAt: failedAt.toISOString() },
    };
    await tx.update(supplierProductsTable).set({
      importStatus: "source_unavailable",
      importError: "Supplier source could not be refreshed. Retry will be attempted automatically.",
      lastAttemptedSync: failedAt,
      sourceMetadata,
    }).where(and(eq(supplierProductsTable.id, current.id), eq(supplierProductsTable.merchantId, current.merchantId)));
    await tx.insert(supplierImportAttemptsTable).values({
      merchantId: current.merchantId,
      supplierProductId: current.id,
      sourceUrl: current.sourceUrl,
      status: "source_unavailable",
      message: "Scheduled supplier refresh failed; source data is not safe to use for synchronized checkout.",
    });
    await emitDomainEvent(tx, {
      merchantId: current.merchantId,
      eventType: "supplier.sync_failed",
      aggregateType: "supplier_product",
      aggregateId: current.id,
      actorType: "system",
      actorId: "supplier-sync-worker",
      source: "system",
      idempotencyKey: `supplier-sync-failed:${current.id}:${failedAt.getTime()}`,
      payload: { supplierProductId: current.id, errorCode: "supplier_fetch_failed" },
      before: { importStatus: current.importStatus },
      after: { importStatus: "source_unavailable" },
    });
  });
}

async function persistSupplierObservation(claimed: SupplierProduct, imported: Awaited<ReturnType<typeof importPublicSupplierProduct>>) {
  const observedAt = new Date();
  await db.transaction(async (tx) => {
    const current = (await tx.select().from(supplierProductsTable).where(and(
      eq(supplierProductsTable.id, claimed.id),
      eq(supplierProductsTable.merchantId, claimed.merchantId),
    )).limit(1))[0];
    if (!current || await restoreSupersededClaim(tx, current, claimed)) return;

    const metadata = record(current.sourceMetadata);
    const sync = supplierSyncMeta(current);
    const syncFields = { ...sync };
    delete syncFields.previousState;
    const overrides = record(current.merchantOverrides);
    const observationStock = normalizeSupplierStock(imported.availability, imported.availabilityQuantity);
    const observation = {
      currency: imported.currency,
      price: imported.price,
      salePrice: imported.salePrice,
      availability: imported.availability,
      availabilityQuantity: Number.isSafeInteger(imported.availabilityQuantity) ? imported.availabilityQuantity : null,
    };
    const previousObservation = record(sync.lastObservation);
    const sourceObservationChanged =
      !sameValue(previousObservation.currency, observation.currency) ||
      !sameValue(previousObservation.price, observation.price) ||
      !sameValue(previousObservation.salePrice, observation.salePrice) ||
      !sameValue(previousObservation.availability, observation.availability) ||
      !sameValue(previousObservation.availabilityQuantity, observation.availabilityQuantity);

    const updates: Record<string, unknown> = { lastAttemptedSync: observedAt, importError: null };
    const changedFields: string[] = [];
    const setIfChanged = (field: keyof SupplierProduct, value: unknown) => {
      if (!sameValue(current[field], value)) {
        updates[field] = value;
        changedFields.push(String(field));
      }
    };
    if (!overridden(overrides, "availability")) setIfChanged("availability", imported.availability);
    if (!overridden(overrides, "availabilityQuantity", "inventoryQuantity")) {
      setIfChanged("availabilityQuantity", observationStock.availabilityQuantity);
    }
    if (!overridden(overrides, "inventoryStatus")) setIfChanged("inventoryStatus", observationStock.inventoryStatus);

    const currencyOverride = overrides.currency === true;
    const costOverride = overridden(overrides, "costPrice", "price", "salePrice", "currency");
    const sourceCurrencyMismatch = imported.currency !== current.currency && !currencyOverride;
    const sourceCostMissing = imported.price === null && !costOverride;
    let costChanged = false;
    let needsReview = false;
    let pauseForReview = false;

    if (sourceCurrencyMismatch) {
      needsReview = true;
      pauseForReview = true;
      updates.importError = "Supplier currency changed. Confirm currency and costs before publishing this product again.";
    } else if (sourceCostMissing) {
      needsReview = true;
      pauseForReview = true;
      updates.importError = "Supplier no longer exposes a readable base cost. Confirm current costs before publishing again.";
    } else if (!costOverride && imported.currency === current.currency) {
      const nextPrice = imported.price === null ? current.price : imported.price;
      const nextSalePrice = imported.salePrice;
      costChanged = !sameValue(nextPrice, current.price) || !sameValue(nextSalePrice, current.salePrice);
      if (imported.price !== null) setIfChanged("price", imported.price);
      setIfChanged("salePrice", nextSalePrice);

      if (costChanged) {
        if (current.pricingMode === "custom" || overrides.sellingPrice === true) {
          needsReview = true;
          pauseForReview = true;
          updates.importError = "Supplier cost changed while this product uses custom pricing. Review the selling price before publishing again.";
        } else if (imported.price === null) {
          needsReview = true;
          pauseForReview = true;
          updates.importError = "Supplier base cost is unavailable. Review pricing before publishing again.";
        } else {
          const desiredSellingPrice = calculateSupplierSellingPrice(
            imported.price, current.profitType, current.profitValue, current.pricingMode, current.sellingPrice,
          );
          const effectiveCostMinor = moneyMinor(nextSalePrice ?? nextPrice);
          const sellingMinor = moneyMinor(desiredSellingPrice);
          const policyResult = await tx.execute(sql`
            SELECT min_margin_percent, max_price_multiplier
            FROM merchant_automation_policies WHERE merchant_id = ${current.merchantId} LIMIT 1
          `);
          const policy = policyResult.rows[0] as { min_margin_percent?: string | number; max_price_multiplier?: string | number } | undefined;
          const minMarginPercent = policy ? Number(policy.min_margin_percent) : 15;
          const maxPriceMultiplier = policy ? Number(policy.max_price_multiplier) : 3;
          let floorMinor: number | null = null;
          if (Number.isFinite(minMarginPercent) && minMarginPercent >= 0 && minMarginPercent < 100 && effectiveCostMinor !== null && effectiveCostMinor > 0) {
            floorMinor = recommendDynamicPrice({
              supplierCostMinor: effectiveCostMinor,
              percentageFeeBps: 100,
              targetMarginPercent: minMarginPercent,
            }).floorPriceMinor;
          }
          const capMinor = effectiveCostMinor === null ? NaN : Math.floor(effectiveCostMinor * maxPriceMultiplier);
          if (
            sellingMinor === null || desiredSellingPrice === null || !Number.isFinite(desiredSellingPrice) || desiredSellingPrice <= 0 ||
            floorMinor === null || !Number.isSafeInteger(capMinor) || capMinor < floorMinor ||
            sellingMinor < floorMinor || sellingMinor > capMinor
          ) {
            needsReview = true;
            pauseForReview = true;
            updates.importError = "Supplier cost changed outside merchant margin or maximum-price guardrails. Review pricing before publishing again.";
          } else {
            setIfChanged("sellingPrice", desiredSellingPrice.toFixed(2));
          }
        }
      }
    }

    if (pauseForReview) {
      updates.status = "draft";
      updates.visibility = "hidden";
      updates.publishedAt = null;
    }
    if (needsReview) {
      updates.importStatus = "needs_review";
    } else if (current.importStatus === "source_unavailable" || current.importStatus === "syncing") {
      updates.importStatus = "imported";
    } else {
      updates.importStatus = current.importStatus;
    }
    updates.sourceMetadata = {
      ...metadata,
      supplierSync: {
        ...syncFields,
        state: "ready",
        lastSuccessAt: observedAt.toISOString(),
        lastAttemptAt: observedAt.toISOString(),
        lastErrorCode: null,
        lastObservation: observation,
      },
    };

    await tx.update(supplierProductsTable).set(updates as any).where(and(
      eq(supplierProductsTable.id, current.id),
      eq(supplierProductsTable.merchantId, current.merchantId),
    ));
    await tx.insert(supplierImportAttemptsTable).values({
      merchantId: current.merchantId,
      supplierProductId: current.id,
      sourceUrl: current.sourceUrl,
      status: needsReview ? "needs_review" : (changedFields.length ? "synced" : "imported"),
      message: pauseForReview
        ? "Scheduled supplier sync paused the listing for margin, currency, or pricing review."
        : (changedFields.length ? "Scheduled synchronized supplier fields updated." : "Scheduled supplier refresh completed; no catalog fields changed."),
      changes: [...changedFields, ...(sourceCurrencyMismatch ? ["sourceCurrencyMismatch"] : []), ...(sourceCostMissing ? ["sourceCostMissing"] : [])],
    });

    if (sourceObservationChanged || changedFields.length || pauseForReview) {
      await emitDomainEvent(tx, {
        merchantId: current.merchantId,
        eventType: "supplier.observation_changed",
        aggregateType: "supplier_product",
        aggregateId: current.id,
        actorType: "system",
        actorId: "supplier-sync-worker",
        source: "system",
        idempotencyKey: `supplier-observation:${current.id}:${observedAt.getTime()}`,
        payload: {
          supplierProductId: current.id,
          changedFields,
          sourceCurrency: imported.currency,
          sourcePrice: imported.price,
          sourceSalePrice: imported.salePrice,
          sourceAvailability: imported.availability,
          sourceAvailabilityQuantity: observationStock.availabilityQuantity,
          pricingNeedsReview: needsReview,
          listingPaused: pauseForReview,
        },
        before: {
          price: current.price, salePrice: current.salePrice, sellingPrice: current.sellingPrice,
          currency: current.currency, inventoryStatus: current.inventoryStatus,
          availabilityQuantity: current.availabilityQuantity, visibility: current.visibility,
        },
        after: {
          price: updates.price ?? current.price,
          salePrice: updates.salePrice === undefined ? current.salePrice : updates.salePrice,
          sellingPrice: updates.sellingPrice ?? current.sellingPrice,
          currency: current.currency,
          inventoryStatus: updates.inventoryStatus ?? current.inventoryStatus,
          availabilityQuantity: updates.availabilityQuantity === undefined ? current.availabilityQuantity : updates.availabilityQuantity,
          visibility: updates.visibility ?? current.visibility,
        },
      });
    }
  });
}

export async function runSupplierSyncBatch(): Promise<number> {
  const claimed = await claimDueSupplierProducts();
  for (const product of claimed) {
    try {
      await persistSupplierObservation(product, await importPublicSupplierProduct(product.sourceUrl));
    } catch {
      try {
        await failSupplierSync(product);
      } catch (error) {
        logger.error({ err: error, merchantId: product.merchantId, supplierProductId: product.id }, "Supplier sync failure could not be persisted");
      }
    }
  }
  if (claimed.length) logger.info({ count: claimed.length }, "Synchronized supplier inventory batch completed");
  return claimed.length;
}

let running = false;
export function startSupplierSyncWorker() {
  const run = async () => {
    if (running) return;
    running = true;
    try { await runSupplierSyncBatch(); }
    catch (error) { logger.error({ err: error }, "Supplier sync worker crashed"); }
    finally { running = false; }
  };
  void run();
  const timer = setInterval(() => void run(), WORKER_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
