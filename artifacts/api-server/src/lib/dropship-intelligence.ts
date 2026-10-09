import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { completeLunavoBrain } from "./ai-provider";
import { resolveAutoFallbackSupplierProduct } from "./supplier-routing";
import { recallMerchantMemory, rememberMerchantMemory } from "./merchant-ai-memory";
import { currencyMinorDigits, toMinorUnits } from "./money";

type Row = Record<string, unknown>;
type SupplierFallback = Awaited<ReturnType<typeof resolveAutoFallbackSupplierProduct>>;

const VALID_STATUSES = new Set(["paid","processing","completed","shipped","delivered"]);

function int(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : fallback;
}

function money(value: unknown, currency: string): number | null {
  return toMinorUnits(value, currencyMinorDigits(currency));
}

function isoDaysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

function recencyDays(date: unknown): number | null {
  if (!date) return null;
  const ms = new Date(String(date)).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 86_400_000));
}

function ageHours(date: unknown): number | null {
  if (!date) return null;
  const ms = new Date(String(date)).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, (Date.now() - ms) / 3_600_000);
}

function shippingLeadTime(value: unknown): number {
  const text = JSON.stringify(value ?? "");
  const nums = [...text.matchAll(/\b(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s*(?:business\s*)?(?:day|days)\b/gi)]
    .flatMap((match) => [Number(match[1]), Number(match[2] ?? match[1])])
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 365);
  return nums.length ? Math.max(...nums) : 7;
}

export function conversionRateBps(purchases: number, clicks: number): number | null {
  if (!Number.isSafeInteger(purchases) || purchases < 0 || !Number.isSafeInteger(clicks) || clicks <= 0) return null;
  const rate = (BigInt(purchases) * 10_000n) / BigInt(clicks);
  return rate <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rate) : null;
}

export type ComparableLandedScenario = {
  currency: string;
  sellingPriceMinor: number;
  contributionMarginBps: number;
};

export function selectUniqueComparableLandedScenario<T extends ComparableLandedScenario>(
  scenarios: readonly T[],
  storeCurrency: string,
  currentSellingPriceMinor: number | null,
): T | null {
  const currency = storeCurrency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency) || currentSellingPriceMinor === null ||
      !Number.isSafeInteger(currentSellingPriceMinor) || currentSellingPriceMinor <= 0) return null;
  const matches = scenarios.filter((scenario) =>
    scenario.currency.toUpperCase() === currency &&
    scenario.sellingPriceMinor === currentSellingPriceMinor &&
    Number.isSafeInteger(scenario.contributionMarginBps) &&
    scenario.contributionMarginBps >= -2_147_483_648 &&
    scenario.contributionMarginBps <= 10_000
  );
  return matches.length === 1 ? matches[0]! : null;
}

export function confidenceFor(orderCount: number): number {
  return Math.min(9200, 2500 + Math.min(1, orderCount / 20) * 5500);
}

export function churnRisk(orderCount: number, recency: number | null): number {
  if (recency === null) return 0;
  if (orderCount <= 1) return Math.min(9500, 2500 + recency * 70);
  if (recency <= 14) return 700;
  if (recency <= 30) return 1800;
  if (recency <= 60) return 4200;
  if (recency <= 90) return 6800;
  return Math.min(9800, 7600 + Math.min(2200, (recency - 90) * 40));
}

export function segment(orderCount: number, ltvMinor: number, recency: number | null, highValue = false): string {
  if (recency !== null && recency > 120) return "lapsed";
  // Absolute minor-unit thresholds are not comparable across NGN, USD, GBP, etc.
  // High-value status is supplied by a same-merchant, same-currency cohort rule below.
  if (orderCount >= 5 || (highValue && ltvMinor > 0)) return "vip";
  if (orderCount >= 2 && recency !== null && recency <= 60) return "loyal";
  if (orderCount === 1 && recency !== null && recency <= 45) return "new";
  if (recency !== null && recency > 60) return "at_risk";
  return "new";
}

export function nextBestAction(seg: string, consent: boolean, churnRiskBps: number): string {
  if (!consent) return "observe";
  if (seg === "lapsed" || churnRiskBps >= 7000) return "winback";
  if (seg === "at_risk") return "retention_offer";
  if (seg === "vip") return "vip_upsell";
  if (seg === "loyal") return "cross_sell";
  return "first_repeat_purchase";
}

export function availableMerchantStock(onHand: number | null, reserved: number): number | null {
  if (onHand === null || !Number.isSafeInteger(onHand) || onHand < 0) return null;
  const held = Number.isSafeInteger(reserved) ? Math.max(0, reserved) : 0;
  return Math.max(0, onHand - held);
}

export function supplierStockIsAtRisk(availability: unknown, quantity: number | null, requiredUnits: number): boolean {
  const text = String(availability ?? "").toLowerCase();
  const unavailable = /out[ -]?of[ -]?stock|unavailable|sold[ -]?out|discontinued|not[ -]?available/.test(text);
  if (unavailable || quantity === 0) return true;
  return quantity !== null && Number.isSafeInteger(quantity) && quantity >= 0
    ? quantity <= Math.max(1, Number.isSafeInteger(requiredUnits) ? Math.max(0, requiredUnits) : 0)
    : false;
}

export function partialSourceMarginBps(sellingPriceMinor: number | null, sourceCostMinor: number | null, comparableCurrency: boolean): number | null {
  if (!comparableCurrency || sellingPriceMinor === null || sourceCostMinor === null ||
      !Number.isSafeInteger(sellingPriceMinor) || !Number.isSafeInteger(sourceCostMinor) ||
      sellingPriceMinor <= 0 || sourceCostMinor < 0) return null;
  const platformFeeMinor = Math.floor(sellingPriceMinor / 100 + 0.5);
  return Math.trunc(((sellingPriceMinor - sourceCostMinor - platformFeeMinor) * 10_000) / sellingPriceMinor);
}

export async function buildDropshipOperatingGraph(merchantId: number) {
  if (!Number.isInteger(merchantId) || merchantId <= 0) throw new Error("Invalid merchant id");

  const [merchantResult, productResult, orderResult, customerResult, fulfillmentResult, campaignResult, researchResult, inventoryMovementResult, reservationResult, supplierSyncResult, supplierSyncPolicyResult, landedScenarioResult, supplierQuoteResult] = await Promise.all([
    db.execute(sql`SELECT id,name,store_name,currency,tax_rate,shipping_fee,free_shipping_threshold FROM merchants WHERE id=${merchantId} AND status='active' LIMIT 1`),
    db.execute(sql`SELECT id,title,category,brand,currency,price,sale_price,selling_price,availability,availability_quantity,inventory_strategy,status,visibility,shipping_information,shipping_configuration,source_domain,imported_at,last_attempted_sync,updated_at FROM supplier_products WHERE merchant_id=${merchantId} ORDER BY updated_at DESC LIMIT 500`),
    db.execute(sql`SELECT id,customer_id,supplier_product_id,quantity,total,currency,status,created_at,fulfillment_status FROM orders WHERE merchant_id=${merchantId} AND created_at >= ${isoDaysAgo(180)} ORDER BY created_at DESC LIMIT 5000`),
    db.execute(sql`SELECT id,name,email,marketing_consent,created_at,updated_at FROM customers WHERE merchant_id=${merchantId} ORDER BY updated_at DESC LIMIT 2000`),
    db.execute(sql`SELECT status,COUNT(*)::int AS count,COUNT(*) FILTER (WHERE last_error IS NOT NULL OR status IN ('failed','exception','review_required'))::int AS exception_count,COUNT(*) FILTER (WHERE status NOT IN ('delivered','cancelled','completed') AND updated_at < now() - INTERVAL '72 hours')::int AS stale_count FROM fulfillment_jobs WHERE merchant_id=${merchantId} GROUP BY status ORDER BY count DESC`),
    db.execute(sql`SELECT product_id,COALESCE(SUM(impressions),0)::bigint impressions,COALESCE(SUM(clicks),0)::bigint clicks,COALESCE(SUM(add_to_carts),0)::bigint add_to_carts,COALESCE(SUM(purchases),0)::bigint purchases,COALESCE(SUM(attributed_revenue_minor),0)::bigint revenue_minor FROM product_advertising_campaigns WHERE merchant_id=${merchantId} GROUP BY product_id`),
    db.execute(sql`SELECT id,supplier_product_id,source_kind,source_url,observed_at,currency,observed_price_minor,demand_score,competition_score,trend_score,notes,evidence,model FROM dropship_market_research WHERE merchant_id=${merchantId} ORDER BY observed_at DESC LIMIT 500`),
    db.execute(sql`SELECT supplier_product_id,COALESCE(SUM(quantity_delta),0)::bigint AS on_hand FROM inventory_movements WHERE merchant_id=${merchantId} GROUP BY supplier_product_id`),
    db.execute(sql`SELECT supplier_product_id,COALESCE(SUM(quantity),0)::bigint AS reserved FROM inventory_reservations WHERE merchant_id=${merchantId} AND status='reserved' AND expires_at > now() GROUP BY supplier_product_id`),
    db.execute(sql`SELECT DISTINCT ON (supplier_product_id) supplier_product_id,status,created_at,completed_at,error_message FROM supplier_sync_runs WHERE merchant_id=${merchantId} ORDER BY supplier_product_id,created_at DESC`),
    db.execute(sql`SELECT supplier_product_id,enabled,sync_price,sync_stock,max_price_change_bps,min_margin_bps,out_of_stock_action,require_price_review,auto_apply,last_run_at FROM supplier_sync_policies WHERE merchant_id=${merchantId}`),
    db.execute(sql`SELECT DISTINCT ON (supplier_product_id,destination_country,currency) id,supplier_product_id,scenario_name,destination_country,currency,quantity,source_cost_minor,outbound_shipping_minor,freight_minor,insurance_minor,handling_minor,packaging_minor,selling_price_minor,dutiable_base_minor,customs_duty_minor,import_tax_base_minor,import_tax_minor,landed_cost_minor,platform_fee_minor,provider_fee_minor,returns_reserve_minor,contribution_margin_minor,contribution_margin_bps,calculation_version,created_at FROM dropship_landed_cost_scenarios WHERE merchant_id=${merchantId} AND supplier_product_id IS NOT NULL ORDER BY supplier_product_id,destination_country,currency,created_at DESC LIMIT 3000`),
    db.execute(sql`SELECT DISTINCT ON (supplier_product_id,destination_country,currency) id,supplier_product_id,supplier_name,destination_country,currency,quantity,status,quoted_unit_price_minor,quoted_shipping_minor,quoted_total_minor,quoted_delivery_days,quote_expires_at,target_unit_price_minor,desired_delivery_days,request_notes,quote_notes,updated_at FROM dropship_supplier_quote_requests WHERE merchant_id=${merchantId} AND supplier_product_id IS NOT NULL AND (updated_at > now() - INTERVAL '180 days' OR status IN ('quoted','accepted')) ORDER BY supplier_product_id,destination_country,currency,updated_at DESC LIMIT 3000`),
  ]);

  const merchant = (merchantResult.rows[0] ?? null) as Row | null;
  if (!merchant) throw new Error("Merchant workspace not found");

  const products = productResult.rows as Row[];
  const orders = orderResult.rows as Row[];
  const customers = customerResult.rows as Row[];

  const units30 = new Map<number, number>();
  const units14 = new Map<number, number>();
  const unitsPrev16 = new Map<number, number>();
  const revenueMinor30 = new Map<number, number>();
  const currency = String(merchant.currency ?? "USD").toUpperCase();
  const inventoryOnHand = new Map<number, number>();
  for (const row of inventoryMovementResult.rows as Row[]) {
    const productId = int(row.supplier_product_id, 0);
    if (productId > 0) inventoryOnHand.set(productId, int(row.on_hand, 0));
  }
  const inventoryReserved = new Map<number, number>();
  for (const row of reservationResult.rows as Row[]) {
    const productId = int(row.supplier_product_id, 0);
    if (productId > 0) inventoryReserved.set(productId, int(row.reserved, 0));
  }
  const supplierSyncStatus = new Map<number, Row>();
  for (const row of supplierSyncResult.rows as Row[]) {
    const productId = int(row.supplier_product_id, 0);
    if (productId > 0) supplierSyncStatus.set(productId, row);
  }
  const supplierSyncPolicies = new Map<number, Row>();
  for (const row of supplierSyncPolicyResult.rows as Row[]) {
    const productId = int(row.supplier_product_id, 0);
    if (productId > 0) supplierSyncPolicies.set(productId, row);
  }
  const landedScenariosByProduct = new Map<number, Row[]>();
  for (const row of landedScenarioResult.rows as Row[]) {
    const productId = int(row.supplier_product_id, 0);
    if (productId <= 0) continue;
    const rows = landedScenariosByProduct.get(productId) ?? [];
    if (rows.length < 4) rows.push(row);
    landedScenariosByProduct.set(productId, rows);
  }
  const supplierQuotesByProduct = new Map<number, Row[]>();
  for (const row of supplierQuoteResult.rows as Row[]) {
    const productId = int(row.supplier_product_id, 0);
    if (productId <= 0) continue;
    const rows = supplierQuotesByProduct.get(productId) ?? [];
    if (rows.length < 4) rows.push(row);
    supplierQuotesByProduct.set(productId, rows);
  }
  const fulfillmentStats = (fulfillmentResult.rows as Row[]).reduce((acc, row) => ({
    jobCount: acc.jobCount + Math.max(0, int(row.count)),
    exceptionCount: acc.exceptionCount + Math.max(0, int(row.exception_count)),
    staleCount: acc.staleCount + Math.max(0, int(row.stale_count)),
  }), { jobCount: 0, exceptionCount: 0, staleCount: 0 });
  const customerMetricsResult = await db.execute(sql`
    SELECT customer_id,
      COUNT(*)::int AS order_count,
      COUNT(*) FILTER (WHERE upper(currency)=${currency})::int AS comparable_order_count,
      COALESCE(SUM(total) FILTER (WHERE upper(currency)=${currency}),0)::text AS gross,
      MAX(created_at) AS last_date,
      ARRAY_AGG(DISTINCT upper(currency)) AS currencies
    FROM orders
    WHERE merchant_id=${merchantId} AND status IN ('paid','processing','completed','shipped','delivered')
    GROUP BY customer_id
  `);
  const customerMetrics = new Map<number, { count: number; comparableOrderCount: number; grossMinor: number; lastDate: string | null; currencies: string[] }>();
  for (const row of customerMetricsResult.rows as Row[]) {
    const id = int(row.customer_id, 0);
    const rawCurrencies = Array.isArray(row.currencies) ? row.currencies : [];
    customerMetrics.set(id, {
      count: Math.max(0, int(row.order_count)),
      comparableOrderCount: Math.max(0, int(row.comparable_order_count)),
      grossMinor: Math.max(0, money(row.gross, currency) ?? 0),
      lastDate: row.last_date ? new Date(String(row.last_date)).toISOString() : null,
      currencies: rawCurrencies.map((value) => String(value).toUpperCase()).filter((value) => /^[A-Z]{3}$/.test(value)).slice(0, 10),
    });
  }

  const cutoff14 = isoDaysAgo(14);
  const cutoff30 = isoDaysAgo(30);
  for (const row of orders) {
    if (!VALID_STATUSES.has(String(row.status))) continue;
    const when = new Date(String(row.created_at));
    if (!Number.isFinite(when.getTime())) continue;

    const productId = int(row.supplier_product_id, 0);
    const qty = Math.max(0, int(row.quantity, 0));
    if (productId > 0 && when >= cutoff30) {
      units30.set(productId, (units30.get(productId) ?? 0) + qty);
      const total = money(row.total, String(row.currency ?? currency).toUpperCase());
      if (total !== null && String(row.currency ?? currency).toUpperCase() === currency) revenueMinor30.set(productId, (revenueMinor30.get(productId) ?? 0) + total);
      if (when >= cutoff14) units14.set(productId, (units14.get(productId) ?? 0) + qty);
      else unitsPrev16.set(productId, (unitsPrev16.get(productId) ?? 0) + qty);
    }

  }

  const campaigns = new Map<number, Row>();
  for (const row of campaignResult.rows as Row[]) {
    const id = int(row.product_id, 0);
    if (id > 0) campaigns.set(id, row);
  }

  const productIntelligence = products.map((product) => {
    const id = int(product.id);
    const sold30 = units30.get(id) ?? 0;
    const sold14 = units14.get(id) ?? 0;
    const soldPrev16 = unitsPrev16.get(id) ?? 0;
    const daily = sold30 / 30;
    const recentDaily = sold14 / 14;
    const priorDaily = soldPrev16 / 16;
    const trend = priorDaily > 0 ? Math.max(0.55, Math.min(1.75, recentDaily / priorDaily)) : (sold14 > 0 ? 1.15 : 0.85);
    const projected30 = Math.max(0, daily * 30 * trend);
    const confidenceBps = confidenceFor(sold30);
    const strategy = String(product.inventory_strategy ?? "source_based").toLowerCase();
    const supplierStock = product.availability_quantity == null ? null : Math.max(0, int(product.availability_quantity));
    const ledgerOnHand = inventoryOnHand.has(id) ? Math.max(0, inventoryOnHand.get(id) ?? 0) : null;
    const reserved = ledgerOnHand === null ? 0 : Math.max(0, inventoryReserved.get(id) ?? 0);
    const stock = availableMerchantStock(ledgerOnHand, reserved);
    const leadTimeDays = shippingLeadTime(product.shipping_information);
    const leadUnits = Math.ceil(daily * leadTimeDays * trend);
    const safetyUnits = Math.ceil(Math.max(1, daily * 3));
    // Source-reported stock is never treated as merchant-owned inventory.
    const reorderUnits = stock === null || strategy === "source_based"
      ? 0
      : Math.max(0, Math.ceil(projected30 + leadUnits + safetyUnits - stock));
    const supplierStockRisk = supplierStockIsAtRisk(product.availability, supplierStock, leadUnits + safetyUnits);
    const syncState = supplierSyncStatus.get(id) ?? null;
    const syncPolicy = supplierSyncPolicies.get(id) ?? null;
    const lastObservedAt = syncState?.completed_at ?? syncState?.created_at ?? product.last_attempted_sync ?? product.imported_at ?? null;
    const supplierDataAgeHours = ageHours(lastObservedAt);
    const supplierDataStale = syncState?.status === "failed" || supplierDataAgeHours === null || supplierDataAgeHours > 72;
    const syncEnabled = syncPolicy?.enabled === true;
    const syncStatus = syncState ? String(syncState.status) : "never_synced";
    const landedCostScenarios = (landedScenariosByProduct.get(id) ?? []).map((scenario) => ({
      id: String(scenario.id),
      name: String(scenario.scenario_name ?? "Landed cost scenario"),
      destinationCountry: String(scenario.destination_country ?? ""),
      currency: String(scenario.currency ?? "").toUpperCase(),
      quantity: Math.max(1, int(scenario.quantity, 1)),
      sourceCostMinor: int(scenario.source_cost_minor, 0),
      outboundShippingMinor: int(scenario.outbound_shipping_minor, 0),
      freightMinor: int(scenario.freight_minor, 0),
      insuranceMinor: int(scenario.insurance_minor, 0),
      handlingMinor: int(scenario.handling_minor, 0),
      packagingMinor: int(scenario.packaging_minor, 0),
      sellingPriceMinor: int(scenario.selling_price_minor, 0),
      landedCostMinor: int(scenario.landed_cost_minor, 0),
      providerFeeMinor: int(scenario.provider_fee_minor, 0),
      platformFeeMinor: int(scenario.platform_fee_minor, 0),
      returnsReserveMinor: int(scenario.returns_reserve_minor, 0),
      contributionMarginMinor: int(scenario.contribution_margin_minor, 0),
      contributionMarginBps: int(scenario.contribution_margin_bps, 0),
      calculationVersion: String(scenario.calculation_version ?? "unknown"),
      createdAt: scenario.created_at ? new Date(String(scenario.created_at)).toISOString() : null,
      evidenceStatus: "operator_supplied_assumptions; destination-specific estimate, not a binding supplier quote",
    }));
    const latestSupplierQuotes = (supplierQuotesByProduct.get(id) ?? []).map((quote) => {
      const expiry = quote.quote_expires_at ? new Date(String(quote.quote_expires_at)) : null;
      return {
        id: String(quote.id),
        supplierName: typeof quote.supplier_name === "string" ? quote.supplier_name.slice(0, 200) : null,
        destinationCountry: String(quote.destination_country ?? ""),
        currency: String(quote.currency ?? "").toUpperCase(),
        quantity: Math.max(1, int(quote.quantity, 1)),
        status: String(quote.status ?? "draft"),
        quotedUnitPriceMinor: quote.quoted_unit_price_minor == null ? null : int(quote.quoted_unit_price_minor, 0),
        quotedShippingMinor: quote.quoted_shipping_minor == null ? null : int(quote.quoted_shipping_minor, 0),
        quotedTotalMinor: quote.quoted_total_minor == null ? null : int(quote.quoted_total_minor, 0),
        deliveryDays: quote.quoted_delivery_days == null ? null : int(quote.quoted_delivery_days, 0),
        targetUnitPriceMinor: quote.target_unit_price_minor == null ? null : int(quote.target_unit_price_minor, 0),
        desiredDeliveryDays: quote.desired_delivery_days == null ? null : int(quote.desired_delivery_days, 0),
        expiresAt: expiry && Number.isFinite(expiry.getTime()) ? expiry.toISOString() : null,
        expired: Boolean(expiry && Number.isFinite(expiry.getTime()) && expiry.getTime() <= Date.now()),
        requestNotes: String(quote.request_notes ?? "").slice(0, 300),
        quoteNotes: String(quote.quote_notes ?? "").slice(0, 300),
        updatedAt: quote.updated_at ? new Date(String(quote.updated_at)).toISOString() : null,
        evidenceStatus: "merchant_recorded_quote; verify source evidence before treating as binding",
      };
    });

    const sourceCurrency = String(product.currency ?? currency).toUpperCase();
    const sourceCostMinor = money(product.sale_price ?? product.price, sourceCurrency);
    const sellingPriceMinor = money(product.selling_price, currency);
    const comparableCurrency = sourceCurrency === currency;
    // A saved scenario is usable as today's product landed cost only when it is the
    // sole scenario that matches the current selling price and store currency. If
    // destination or scenario selection is ambiguous, keep landedCostMinor null.
    const selectedLandedScenario = selectUniqueComparableLandedScenario(
      landedCostScenarios,
      currency,
      sellingPriceMinor,
    );
    const landedCostMinor: number | null = selectedLandedScenario?.landedCostMinor ?? null;
    const partialMarginBps = partialSourceMarginBps(sellingPriceMinor, sourceCostMinor, comparableCurrency);
    const contributionMarginBps = selectedLandedScenario?.contributionMarginBps ?? partialMarginBps;
    const marginBasis = selectedLandedScenario
      ? "evidence-qualified landed-cost scenario; current selling price and currency match; destination-specific; exclusions remain in scenario warnings"
      : "source_cost_plus_lunavo_1pct_fee; excludes unverified shipping, duties, taxes, provider fees, discounts, and returns";

    const campaign = campaigns.get(id);
    const conversionBps = campaign
      ? conversionRateBps(int(campaign.purchases), int(campaign.clicks))
      : null;

    const priorities: string[] = [];
    if (stock !== null && reorderUnits > 0) priorities.push("reorder");
    if (strategy !== "source_based" && stock === null) priorities.push("inventory_baseline_missing");
    if (supplierStockRisk) priorities.push("supplier_stock_risk");
    if (supplierDataStale) priorities.push("supplier_data_stale");
    if (!syncEnabled) priorities.push("supplier_sync_unconfigured");
    if (contributionMarginBps !== null && contributionMarginBps < 1500) priorities.push("margin_review");
    if (trend >= 1.25) priorities.push("scale_winner");
    if (trend <= 0.75 && sold30 > 0) priorities.push("declining_demand");
    if (conversionBps !== null && conversionBps < 500 && int(campaign?.clicks) > 20) priorities.push("conversion_review");
    if (!priorities.length) priorities.push("monitor");

    return {
      id,
      title: String(product.title ?? ""),
      category: product.category,
      sourceDomain: product.source_domain,
      availability: product.availability,
      stock,
      inventoryKnown: stock !== null,
      inventoryStrategy: strategy,
      reservedUnits: reserved,
      supplierStock,
      supplierStockRisk,
      supplierDataAgeHours: supplierDataAgeHours === null ? null : Number(supplierDataAgeHours.toFixed(1)),
      supplierDataStale,
      supplierSyncStatus: syncStatus,
      supplierSyncEnabled: syncEnabled,
      landedCostScenarios,
      latestSupplierQuotes,
      supplierSyncPolicy: syncPolicy ? {
        syncPrice: syncPolicy.sync_price === true,
        syncStock: syncPolicy.sync_stock === true,
        requirePriceReview: syncPolicy.require_price_review !== false,
        autoApply: syncPolicy.auto_apply === true,
        maxPriceChangeBps: int(syncPolicy.max_price_change_bps, 1500),
        minMarginBps: int(syncPolicy.min_margin_bps, 1500),
        outOfStockAction: String(syncPolicy.out_of_stock_action ?? "pause"),
      } : null,
      sourceCurrency,
      sourceCostMinor,
      sellingPriceMinor,
      landedCostMinor,
      selectedLandedScenarioId: selectedLandedScenario?.id ?? null,
      landedContributionMarginMinor: selectedLandedScenario?.contributionMarginMinor ?? null,
      grossMarginBps: contributionMarginBps,
      marginBasis,
      sold30,
      sold14,
      priorDailyUnits: Number(priorDaily.toFixed(4)),
      unitsPerDay: Number(daily.toFixed(4)),
      trendFactor: Number(trend.toFixed(4)),
      projected30,
      leadTimeDays,
      reorderUnits,
      confidenceBps,
      conversionBps,
      adPurchases: campaign ? int(campaign.purchases) : 0,
      adRevenueMinor: campaign ? int(campaign.revenue_minor) : 0,
      revenue30Minor: revenueMinor30.get(id) ?? 0,
      priorities,
      supplierFallback: null as SupplierFallback,
    };
  });

  // Detect unusually valuable customers relative to this merchant's own current
  // currency cohort. Do not compare raw NGN kobo to USD cents, or use a fixed nominal
  // threshold that makes every low-value customer in some currencies a VIP.
  const comparableLtvValues = [...customerMetrics.values()]
    .filter((value) => value.comparableOrderCount > 0 && value.grossMinor > 0)
    .map((value) => value.grossMinor)
    .sort((a, b) => b - a);
  const highValueThresholdMinor = comparableLtvValues.length >= 5
    ? comparableLtvValues[Math.ceil(comparableLtvValues.length * 0.2) - 1] ?? null
    : null;

  const customerIntelligence = customers.map((customer) => {
    const id = int(customer.id);
    const data = customerMetrics.get(id) ?? { count: 0, comparableOrderCount: 0, grossMinor: 0, lastDate: null, currencies: [] };
    const recency = recencyDays(data.lastDate);
    const risk = churnRisk(data.count, recency);
    const highValue = highValueThresholdMinor !== null && data.grossMinor >= highValueThresholdMinor && data.grossMinor > 0;
    const seg = segment(data.count, data.grossMinor, recency, highValue);
    const segmentBasis = data.count >= 5 ? "repeat_order_threshold" : highValue ? "top_20_percent_ltv_in_merchant_currency" : "recency_and_order_behavior";
    const marketingEligible = customer.marketing_consent === true;
    return {
      id,
      name: String(customer.name ?? ""),
      orderCount: data.count,
      comparableOrderCount: data.comparableOrderCount,
      grossMinor: data.grossMinor,
      averageOrderMinor: data.comparableOrderCount > 0 ? Math.trunc(data.grossMinor / data.comparableOrderCount) : 0,
      ltvMinor: data.grossMinor,
      currencyCoverage: data.currencies.length <= 1 ? "single_currency" : "mixed_currency_totals_excluded",
      recencyDays: recency,
      churnRiskBps: risk,
      segment: seg,
      segmentBasis,
      highValueByMerchantCohort: highValue,
      nextBestAction: nextBestAction(seg, marketingEligible, risk),
      marketingEligible,
      currencies: data.currencies,
    };
  });

  const research = researchResult.rows as Row[];
  const fallbackRows = await Promise.all(productIntelligence.filter((product) => (product.reorderUnits > 0 || product.supplierStockRisk) && product.sellingPriceMinor !== null).slice(0, 40).map(async (product) => ({
    productId: product.id,
    fallback: await resolveAutoFallbackSupplierProduct(db, {
      merchantId,
      primaryProductId: product.id,
      sellingPriceMinor: product.sellingPriceMinor,
      sellingCurrency: currency,
    }),
  })));
  const fallbacks = new Map(fallbackRows.map((row) => [row.productId, row.fallback]));
  for (const product of productIntelligence) {
    product.supplierFallback = fallbacks.get(product.id) ?? null;
    if (product.supplierStockRisk && product.supplierFallback) product.priorities.push("fallback_available");
    if (product.priorities.includes("monitor") && product.priorities.length > 1) product.priorities = product.priorities.filter((item) => item !== "monitor");
  }
  const topProducts = [...productIntelligence].sort((a, b) => b.projected30 - a.projected30).slice(0, 20);
  const atRiskCustomers = [...customerIntelligence].filter((x) => x.churnRiskBps >= 6000).sort((a, b) => b.grossMinor - a.grossMinor).slice(0, 20);
  const reorderCandidates = productIntelligence.filter((x) => x.reorderUnits > 0).sort((a, b) => b.reorderUnits - a.reorderUnits).slice(0, 30);
  const supplierRiskProducts = productIntelligence.filter((x) => x.supplierStockRisk).sort((a, b) => Number(Boolean(b.supplierFallback)) - Number(Boolean(a.supplierFallback))).slice(0, 30);
  const quoteRequestCandidates = supplierRiskProducts.filter((product) =>
    !product.latestSupplierQuotes.some((quote) => ["quoted", "accepted"].includes(quote.status) && !quote.expired),
  ).slice(0, 8);
  const landedCostScenarioCount = (landedScenarioResult.rows as Row[]).length;
  const supplierQuoteRequestCount = (supplierQuoteResult.rows as Row[]).length;
  const activeSupplierQuoteCount = (supplierQuoteResult.rows as Row[]).filter((quote) =>
    ["quoted", "accepted"].includes(String(quote.status)) &&
    (!quote.quote_expires_at || new Date(String(quote.quote_expires_at)).getTime() > Date.now()),
  ).length;
  const winners = productIntelligence.filter((x) => x.priorities.includes("scale_winner")).slice(0, 20);
  const automationCandidates = [
    ...(fulfillmentStats.exceptionCount > 0 || fulfillmentStats.staleCount > 0 ? [{ kind: "fulfillment.exceptions.review", exceptionCount: fulfillmentStats.exceptionCount, staleCount: fulfillmentStats.staleCount, requiresApproval: true }] : []),
    ...reorderCandidates.slice(0, 10).map((product) => ({ kind: "inventory.reorder.review", productId: product.id, recommendedUnits: product.reorderUnits, requiresApproval: true })),
    ...supplierRiskProducts.slice(0, 10).map((product) => ({ kind: "supplier.stock-risk.review", productId: product.id, supplierStock: product.supplierStock, fallbackAvailable: Boolean(product.supplierFallback), requiresApproval: true })),
    ...quoteRequestCandidates.map((product) => ({ kind: "supplier.quote-request.review", productId: product.id, supplierStockRisk: true, existingQuoteRequests: product.latestSupplierQuotes.length, requiresApproval: true })),
    ...atRiskCustomers.slice(0, 10).map((customer) => ({ kind: "customer.retention.review", customerId: customer.id, nextBestAction: customer.nextBestAction, requiresApproval: true })),
    ...winners.slice(0, 10).map((product) => ({ kind: "growth.scale-review", productId: product.id, requiresApproval: true })),
  ];

  return {
    generatedAt: new Date().toISOString(),
    merchant: {
      id: merchantId,
      name: merchant.name,
      storeName: merchant.store_name,
      currency,
      taxRate: merchant.tax_rate,
      shippingFee: merchant.shipping_fee,
    },
    products: productIntelligence,
    customers: customerIntelligence,
    fulfillment: fulfillmentResult.rows,
    fulfillmentStats,
    summary: {
      productCount: productIntelligence.length,
      customerCount: customerIntelligence.length,
      reorderCandidateCount: reorderCandidates.length,
      decliningProductCount: productIntelligence.filter((x) => x.priorities.includes("declining_demand")).length,
      scaleWinnerCount: winners.length,
      atRiskCustomerCount: atRiskCustomers.length,
      fulfillmentJobCount: fulfillmentStats.jobCount,
      fulfillmentExceptionCount: fulfillmentStats.exceptionCount,
      staleFulfillmentJobCount: fulfillmentStats.staleCount,
      topProducts,
      reorderCandidates,
      supplierRiskProducts,
      supplierStockRiskCount: supplierRiskProducts.length,
      landedCostScenarioCount,
      supplierQuoteRequestCount,
      activeSupplierQuoteCount,
      winners,
      atRiskCustomers,
      automationCandidates,
      researchCount: research.length,
      researchSignals: research.slice(0, 30),
    },
    graph: [
      "product -> demand -> inventory -> reorder -> supplier routing -> fulfillment",
      "source cost + explicit logistics evidence -> evidence-qualified landed cost -> margin guardrail -> conversion -> campaign",
      "order -> customer LTV -> segment -> next-best-action -> marketing eligibility",
      "ad signal -> product conversion -> winner/decline signal -> sourcing/pricing decision",
      "fulfillment exception -> customer context -> notification/support -> retention signal",
    ],

    modernPlatformParity: [
      { feature: "Supplier/product discovery and URL import", status: "implemented", connectedTo: ["research", "catalog", "pricing", "inventory"] },
      { feature: "Multi-supplier mapping and supplier optimizer", status: "implemented", connectedTo: ["supplier", "landed_cost", "fulfillment", "fallback"] },
      { feature: "Price and stock monitoring", status: "implemented", connectedTo: ["supplier_sync", "margin", "inventory", "catalog"] },
      { feature: "Supplier feed freshness and failed-sync triage", status: "implemented", connectedTo: ["sync_history", "source_data", "stock_risk", "price_review"] },
      { feature: "Aged fulfillment and stuck-order exception queue", status: "implemented", connectedTo: ["fulfillment_jobs", "tracking", "customer_support", "retention"] },
      { feature: "Alternative-product / supplier fallback", status: "implemented", connectedTo: ["stock", "destination", "shipping", "margin"] },
      { feature: "Auto-fulfillment and batch operations", status: "implemented", connectedTo: ["verified_order", "supplier", "tracking", "exceptions"] },
      { feature: "Tracking and customer delivery lifecycle", status: "implemented", connectedTo: ["fulfillment", "customer", "support", "retention"] },
      { feature: "Product research / trend / competitor evidence", status: "implemented", connectedTo: ["opportunity", "pricing", "creative", "growth"] },
      { feature: "Landed-cost and margin guardrails", status: "implemented", connectedTo: ["supplier", "tax", "shipping", "fees", "pricing"] },
      { feature: "Multi-store and multi-channel synchronization", status: "implemented", connectedTo: ["catalog", "inventory", "orders", "fulfillment"] },
      { feature: "Branding, creative and lifecycle marketing", status: "implemented", connectedTo: ["catalog", "customers", "ads", "social"] },
      { feature: "Wholesale / purchase-order style procurement", status: "implemented", connectedTo: ["inventory", "supplier", "operations", "finance"] },
      { feature: "POD / external supplier-specific capabilities", status: "adapter_boundary", connectedTo: ["supplier", "catalog", "fulfillment"] },
      { feature: "Bulk supplier URL import and catalog operations", status: "implemented", connectedTo: ["sourcing", "catalog", "review", "pricing"] },
      { feature: "Bulk supplier-order preparation / daily fulfillment batching", status: "implemented", connectedTo: ["verified_order", "fulfillment", "supplier", "idempotency"] },
      { feature: "Supplier optimizer and performance scorecards", status: "implemented", connectedTo: ["cost", "delivery", "sync", "fallback", "risk"] },
      { feature: "Product research, trend and opportunity finder", status: "implemented", connectedTo: ["research", "demand", "competition", "pricing", "growth"] },
      { feature: "Private/custom sourcing and product requests", status: "merchant_workflow", connectedTo: ["sourcing", "supplier", "catalog"] },
      { feature: "Chargeback/dispute operations and recovery", status: "implemented", connectedTo: ["payments", "ledger", "orders", "customer", "risk"] },
      { feature: "Custom branding / customer unboxing configuration", status: "implemented", connectedTo: ["storefront", "media", "fulfillment", "brand"] },
      { feature: "Regional supplier routing and destination-aware economics", status: "implemented", connectedTo: ["country", "shipping", "cost", "fallback", "fulfillment"] },
      { feature: "Wholesale / freight / consolidation connectors", status: "adapter_boundary", connectedTo: ["supplier", "purchase_order", "shipping", "landed_cost"] },
    ],
    intelligenceCapabilities: [
      "Local specialist ensemble: orchestrator + researcher + merchandiser + growth + operations + customer + reviewer",
      "Role-specific model routing chooses the strongest configured local profile for each job",
      "Consensus arbitration merges useful strengths while preserving disagreements and evidence gaps",
      "Deterministic commerce calculations run before model reasoning and remain authoritative",
      "Recommendations feed existing approval, automation, sourcing, inventory, fulfillment and marketing boundaries",
      "Merchant memory stores strategy outputs so future runs can reason from prior decisions without making them authoritative",
    ],
    decisionLoop: [
      "discover -> verify source evidence -> score opportunity -> calculate landed cost -> price with guardrails",
      "publish -> observe demand -> reserve stock -> fulfill -> track -> detect exceptions",
      "measure conversion/margin/returns -> classify winner/decline -> improve listing or supplier route",
      "segment customers -> check consent -> prepare lifecycle action -> measure retention",
      "reconcile finance -> constrain automation -> review risk -> repeat",
    ],
    authorityRules: [
      "Provider-verified payments and the internal ledger remain financial truth.",
      "Server-side inventory movements minus active reservations are the merchant-stock estimate; supplier-reported quantities remain a separate advisory signal.",
      "Margin is a partial estimate after the rounded Lunavo 1% fee; it is not net profit or landed cost while logistics, tax, provider fees, discounts, and returns are missing.",
      "Forecasts are estimates, never guarantees and never direct inventory mutations.",
      "Customer scores guide recommendations only; consent gates marketing actions.",
      "External competitor/ad-spy data is evidence only when recorded with a source and observation time.",
    ],
  };
}

export async function persistDropshipIntelligence(merchantId: number, graph: Awaited<ReturnType<typeof buildDropshipOperatingGraph>>, model = "deterministic_local") {
  await db.transaction(async (tx) => {
    for (const product of graph.products.slice(0, 250)) {
      await tx.execute(sql`
        INSERT INTO dropship_demand_forecasts (
          merchant_id,supplier_product_id,location_key,forecast_date,horizon_days,
          baseline_units_per_day,projected_units,lower_units,upper_units,confidence_bps,
          method,model,recommended_reorder_units,lead_time_days,stock_snapshot,evidence,updated_at
        ) VALUES (
          ${merchantId},${product.id},'global',CURRENT_DATE,30,
          ${product.unitsPerDay},${product.projected30},
          ${Math.max(0, product.projected30 * 0.65)},${product.projected30 * 1.35},
          ${product.confidenceBps},'deterministic_local',${model},
          ${product.reorderUnits},${product.leadTimeDays},${product.stock === null ? null : product.stock},
          ${JSON.stringify({trendFactor:product.trendFactor,sold14:product.sold14,sold30:product.sold30,sourceDomain:product.sourceDomain})}::jsonb,
          now()
        )
        ON CONFLICT (merchant_id,supplier_product_id,location_key,forecast_date,horizon_days)
        DO UPDATE SET
          baseline_units_per_day=EXCLUDED.baseline_units_per_day,
          projected_units=EXCLUDED.projected_units,
          lower_units=EXCLUDED.lower_units,
          upper_units=EXCLUDED.upper_units,
          confidence_bps=EXCLUDED.confidence_bps,
          method=EXCLUDED.method,
          model=EXCLUDED.model,
          recommended_reorder_units=EXCLUDED.recommended_reorder_units,
          lead_time_days=EXCLUDED.lead_time_days,
          stock_snapshot=EXCLUDED.stock_snapshot,
          evidence=EXCLUDED.evidence,
          updated_at=now()
      `);
    }

    for (const customer of graph.customers.slice(0, 1000)) {
      await tx.execute(sql`
        INSERT INTO dropship_customer_scores (
          merchant_id,customer_id,order_count,gross_minor,average_order_minor,ltv_minor,
          recency_days,churn_risk_bps,segment,next_best_action,marketing_eligible,
          method,model,evidence,generated_at,updated_at
        ) VALUES (
          ${merchantId},${customer.id},${customer.orderCount},${customer.grossMinor},${customer.averageOrderMinor},${customer.ltvMinor},
          ${customer.recencyDays},${customer.churnRiskBps},${customer.segment},${customer.nextBestAction},${customer.marketingEligible},
          'deterministic_local',${model},
          ${JSON.stringify({currencies:customer.currencies,lastPurchaseDays:customer.recencyDays})}::jsonb,
          now(),now()
        )
        ON CONFLICT (merchant_id,customer_id)
        DO UPDATE SET
          order_count=EXCLUDED.order_count,
          gross_minor=EXCLUDED.gross_minor,
          average_order_minor=EXCLUDED.average_order_minor,
          ltv_minor=EXCLUDED.ltv_minor,
          recency_days=EXCLUDED.recency_days,
          churn_risk_bps=EXCLUDED.churn_risk_bps,
          segment=EXCLUDED.segment,
          next_best_action=EXCLUDED.next_best_action,
          marketing_eligible=EXCLUDED.marketing_eligible,
          method=EXCLUDED.method,
          model=EXCLUDED.model,
          evidence=EXCLUDED.evidence,
          generated_at=now(),
          updated_at=now()
      `);
    }
  });
}

export async function buildMaxConsensusDropshipPlan(merchantId: number, question?: string | null) {
  const graph = await buildDropshipOperatingGraph(merchantId);
  const memory = await recallMerchantMemory(merchantId, 24);
  const priorMerchantMemory = memory.slice(0, 12).flatMap((item) => {
    const content = typeof item.content === "string" ? item.content.trim().slice(0, 900) : "";
    if (!content) return [];
    return [{
      type: typeof item.memory_type === "string" ? item.memory_type.slice(0, 40) : "unknown",
      key: typeof item.memory_key === "string" ? item.memory_key.slice(0, 160) : "unknown",
      confidenceBps: Number.isInteger(Number(item.confidence_bps)) ? Math.max(0, Math.min(10_000, Number(item.confidence_bps))) : 0,
      source: typeof item.source === "string" ? item.source.slice(0, 120) : "unknown",
      updatedAt: item.updated_at ? new Date(String(item.updated_at)).toISOString() : null,
      content,
    }];
  });
  // Keep the live question and remembered operating preferences at the front of
  // the bounded model context. Use curated evidence rather than serializing the
  // entire product/customer graph and silently truncating the most important tail.
  const context = JSON.stringify({
    question: question?.slice(0, 2000) ?? "How should the store improve profitable dropshipping operations next?",
    memoryGuidance: "Prior memory contains old preferences, lessons, decisions and AI recommendations; it is not current operational truth. Re-check operational claims against the live graph and treat prior recommendations as unapproved unless an explicit approval record is supplied.",
    priorMerchantMemory,
    merchant: graph.merchant,
    summary: {
      productCount: graph.summary.productCount,
      customerCount: graph.summary.customerCount,
      reorderCandidateCount: graph.summary.reorderCandidateCount,
      decliningProductCount: graph.summary.decliningProductCount,
      scaleWinnerCount: graph.summary.scaleWinnerCount,
      atRiskCustomerCount: graph.summary.atRiskCustomerCount,
      supplierStockRiskCount: graph.summary.supplierStockRiskCount,
      landedCostScenarioCount: graph.summary.landedCostScenarioCount,
      supplierQuoteRequestCount: graph.summary.supplierQuoteRequestCount,
      activeSupplierQuoteCount: graph.summary.activeSupplierQuoteCount,
      fulfillmentJobCount: graph.summary.fulfillmentJobCount,
      fulfillmentExceptionCount: graph.summary.fulfillmentExceptionCount,
      staleFulfillmentJobCount: graph.summary.staleFulfillmentJobCount,
      researchCount: graph.summary.researchCount,
      automationCandidates: graph.summary.automationCandidates.slice(0, 16),
    },
    priorityProducts: graph.products
      .filter((product) => product.priorities.some((priority) => priority !== "monitor"))
      .sort((a, b) => b.priorities.length - a.priorities.length || b.reorderUnits - a.reorderUnits)
      .slice(0, 16)
      .map((product) => ({
        id: product.id,
        title: product.title,
        sourceDomain: product.sourceDomain,
        stock: product.stock,
        inventoryKnown: product.inventoryKnown,
        supplierStock: product.supplierStock,
        supplierStockRisk: product.supplierStockRisk,
        supplierDataAgeHours: product.supplierDataAgeHours,
        supplierDataStale: product.supplierDataStale,
        landedCostScenarios: product.landedCostScenarios.slice(0, 2),
        supplierQuotes: product.latestSupplierQuotes.slice(0, 2),
        supplierSyncStatus: product.supplierSyncStatus,
        supplierSyncEnabled: product.supplierSyncEnabled,
        supplierSyncPolicy: product.supplierSyncPolicy,
        sourceCurrency: product.sourceCurrency,
        sourceCostMinor: product.sourceCostMinor,
        sellingPriceMinor: product.sellingPriceMinor,
        marginBasis: product.marginBasis,
        grossMarginBps: product.grossMarginBps,
        revenue30Minor: product.revenue30Minor,
        adRevenueMinor: product.adRevenueMinor,
        sold14: product.sold14,
        sold30: product.sold30,
        trendFactor: product.trendFactor,
        projected30: product.projected30,
        leadTimeDays: product.leadTimeDays,
        reorderUnits: product.reorderUnits,
        conversionBps: product.conversionBps,
        priorities: product.priorities,
        fallbackAvailable: Boolean(product.supplierFallback),
      })),
    atRiskCustomers: graph.summary.atRiskCustomers.slice(0, 8).map((customer) => ({
      id: customer.id,
      orderCount: customer.orderCount,
      currencyCoverage: customer.currencyCoverage,
      recencyDays: customer.recencyDays,
      churnRiskBps: customer.churnRiskBps,
      segment: customer.segment,
      nextBestAction: customer.nextBestAction,
      marketingEligible: customer.marketingEligible,
    })),
    marketResearch: graph.summary.researchSignals.slice(0, 12).map((item) => ({
      sourceKind: String(item.source_kind ?? "unknown").slice(0, 40),
      sourceUrl: String(item.source_url ?? "").slice(0, 400),
      sourceStatus: "merchant_supplied_unverified",
      observedAt: item.observed_at ? new Date(String(item.observed_at)).toISOString() : null,
      currency: String(item.currency ?? "").slice(0, 3),
      observedPriceMinor: item.observed_price_minor ?? null,
      demandScore: item.demand_score ?? null,
      competitionScore: item.competition_score ?? null,
      trendScore: item.trend_score ?? null,
      notes: String(item.notes ?? "").slice(0, 350),
      model: String(item.model ?? "").slice(0, 120),
    })),
    fulfillment: graph.fulfillment.slice(0, 20),
    operatingGraph: graph.graph,
    authorityRules: graph.authorityRules,
  });

  const brain = await completeLunavoBrain(
    "Build one connected dropshipping operating plan that treats modern dropshipping capabilities as one operating system: sourcing/discovery, supplier comparison and mapping, price/stock monitoring, landed cost, inventory forecasts, alternative supplier fallback, order routing, fulfillment, tracking, returns/exceptions, customer lifecycle, creative/ads, multi-store/channel synchronization and finance constraints. Combine specialist strengths across research, merchandising, growth, operations and customer lifecycle. Identify dependencies and sequence. Never invent supplier, payment, stock, customer-consent, market or ad facts. For every action return evidence, expected benefit, uncertainty and approval requirement. Treat forecast values as estimates, not facts.",
    context,
    {
      roles: ["researcher","merchandiser","growth","operations","customer","reviewer"],
      reasoningEffort: "max",
      json: true,
      maxTokens: 6500,
      contextLabel: "connected dropshipping operating graph",
    },
  );

  await rememberMerchantMemory(merchantId, {
    memoryType: "strategy",
    memoryKey: "latest_dropship_operating_plan",
    content: brain.content,
    confidenceBps: 6500,
    source: "max_consensus_dropship_brain",
    model: brain.model,
    evidence: {
      generatedAt: graph.generatedAt,
      reorderCandidateCount: graph.summary.reorderCandidateCount,
      atRiskCustomerCount: graph.summary.atRiskCustomerCount,
      scaleWinnerCount: graph.summary.scaleWinnerCount,
    },
  });
  return { graph, brain, memoryCount: memory.length };
}

export async function recordMarketResearch(input: {
  merchantId: number;
  supplierProductId?: number | null;
  sourceKind: "competitor" | "ad_spy" | "trend" | "supplier" | "market" | "pricing";
  sourceUrl?: string | null;
  currency?: string | null;
  observedPriceMinor?: number | null;
  demandScore?: number | null;
  competitionScore?: number | null;
  trendScore?: number | null;
  notes?: string | null;
  evidence?: Record<string, unknown>;
  capturedBy: string;
  model?: string | null;
}) {
  if (input.sourceUrl && !/^https?:\/\//i.test(input.sourceUrl)) throw new Error("Research source URL must use HTTP(S)");
  const result = await db.execute(sql`
    INSERT INTO dropship_market_research (
      merchant_id,supplier_product_id,source_kind,source_url,currency,observed_price_minor,
      demand_score,competition_score,trend_score,notes,evidence,captured_by,model
    ) VALUES (
      ${input.merchantId},${input.supplierProductId ?? null},${input.sourceKind},
      ${input.sourceUrl?.slice(0, 2048) ?? null},
      ${input.currency ? input.currency.toUpperCase().slice(0, 3) : null},
      ${input.observedPriceMinor ?? null},
      ${input.demandScore ?? null},${input.competitionScore ?? null},${input.trendScore ?? null},
      ${input.notes?.slice(0, 4000) ?? null},
      ${JSON.stringify(input.evidence ?? {})}::jsonb,${input.capturedBy},${input.model ?? null}
    ) RETURNING id,source_kind,source_url,observed_at,evidence
  `);
  return result.rows[0];
}
