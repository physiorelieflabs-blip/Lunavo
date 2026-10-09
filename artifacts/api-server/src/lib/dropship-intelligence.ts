import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { completeLunavoBrain } from "./ai-provider";
import { resolveAutoFallbackSupplierProduct } from "./supplier-routing";
import { recallMerchantMemory, rememberMerchantMemory } from "./merchant-ai-memory";
import { toMinorUnits } from "./money";

type Row = Record<string, unknown>;
type SupplierFallback = Awaited<ReturnType<typeof resolveAutoFallbackSupplierProduct>>;

const VALID_STATUSES = new Set(["paid","processing","completed","shipped","delivered"]);

function int(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : fallback;
}

function money(value: unknown): number | null {
  return toMinorUnits(value);
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

function shippingLeadTime(value: unknown): number {
  const text = JSON.stringify(value ?? "");
  const nums = [...text.matchAll(/\b(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s*(?:business\s*)?(?:day|days)\b/gi)]
    .flatMap((match) => [Number(match[1]), Number(match[2] ?? match[1])])
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 365);
  return nums.length ? Math.max(...nums) : 7;
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

export function segment(orderCount: number, ltvMinor: number, recency: number | null): string {
  if (recency !== null && recency > 120) return "lapsed";
  if (orderCount >= 5 || ltvMinor >= 250_000) return "vip";
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

export async function buildDropshipOperatingGraph(merchantId: number) {
  if (!Number.isInteger(merchantId) || merchantId <= 0) throw new Error("Invalid merchant id");

  const [merchantResult, productResult, orderResult, customerResult, fulfillmentResult, campaignResult, researchResult, inventoryMovementResult, reservationResult] = await Promise.all([
    db.execute(sql`SELECT id,name,store_name,currency,tax_rate,shipping_fee,free_shipping_threshold FROM merchants WHERE id=${merchantId} AND status='active' LIMIT 1`),
    db.execute(sql`SELECT id,title,category,brand,currency,price,sale_price,selling_price,availability,availability_quantity,inventory_strategy,status,visibility,shipping_information,shipping_configuration,source_domain,updated_at FROM supplier_products WHERE merchant_id=${merchantId} ORDER BY updated_at DESC LIMIT 500`),
    db.execute(sql`SELECT id,customer_id,supplier_product_id,quantity,total,currency,status,created_at,fulfillment_status FROM orders WHERE merchant_id=${merchantId} AND created_at >= ${isoDaysAgo(180)} ORDER BY created_at DESC LIMIT 5000`),
    db.execute(sql`SELECT id,name,email,marketing_consent,created_at,updated_at FROM customers WHERE merchant_id=${merchantId} ORDER BY updated_at DESC LIMIT 2000`),
    db.execute(sql`SELECT status,COUNT(*)::int AS count FROM fulfillment_jobs WHERE merchant_id=${merchantId} GROUP BY status ORDER BY count DESC`),
    db.execute(sql`SELECT product_id,COALESCE(SUM(impressions),0)::bigint impressions,COALESCE(SUM(clicks),0)::bigint clicks,COALESCE(SUM(add_to_carts),0)::bigint add_to_carts,COALESCE(SUM(purchases),0)::bigint purchases,COALESCE(SUM(attributed_revenue_minor),0)::bigint revenue_minor FROM product_advertising_campaigns WHERE merchant_id=${merchantId} GROUP BY product_id`),
    db.execute(sql`SELECT id,supplier_product_id,source_kind,source_url,observed_at,currency,observed_price_minor,demand_score,competition_score,trend_score,notes,evidence,model FROM dropship_market_research WHERE merchant_id=${merchantId} ORDER BY observed_at DESC LIMIT 500`),
    db.execute(sql`SELECT supplier_product_id,COALESCE(SUM(quantity_delta),0)::bigint AS on_hand FROM inventory_movements WHERE merchant_id=${merchantId} GROUP BY supplier_product_id`),
    db.execute(sql`SELECT supplier_product_id,COALESCE(SUM(quantity),0)::bigint AS reserved FROM inventory_reservations WHERE merchant_id=${merchantId} AND status='reserved' AND expires_at > now() GROUP BY supplier_product_id`),
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
      const total = money(row.total);
      if (total !== null) revenueMinor30.set(productId, (revenueMinor30.get(productId) ?? 0) + total);
      if (when >= cutoff14) units14.set(productId, (units14.get(productId) ?? 0) + qty);
      else unitsPrev16.set(productId, (unitsPrev16.get(productId) ?? 0) + qty);
    }

    const customerId = int(row.customer_id, 0);
    if (customerId > 0) {
      const current = customerOrders.get(customerId) ?? { count: 0, grossMinor: 0, lastDate: null, currencies: new Set<string>() };
      const total = money(row.total);
      current.count += 1;
      if (total !== null && String(row.currency ?? currency).toUpperCase() === currency) current.grossMinor += total;
      current.lastDate = current.lastDate ? (new Date(current.lastDate) > when ? current.lastDate : when.toISOString()) : when.toISOString();
      current.currencies.add(String(row.currency ?? currency).toUpperCase());
      customerOrders.set(customerId, current);
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
    const stock = ledgerOnHand === null ? null : Math.max(0, ledgerOnHand - reserved);
    const leadTimeDays = shippingLeadTime(product.shipping_information);
    const leadUnits = Math.ceil(daily * leadTimeDays * trend);
    const safetyUnits = Math.ceil(Math.max(1, daily * 3));
    // Source-reported stock is never treated as merchant-owned inventory.
    const reorderUnits = stock === null || strategy === "source_based"
      ? 0
      : Math.max(0, Math.ceil(projected30 + leadUnits + safetyUnits - stock));
    const availabilityText = String(product.availability ?? "").toLowerCase();
    const supplierUnavailable = /out[ -]?of[ -]?stock|unavailable|sold[ -]?out|discontinued|not[ -]?available/.test(availabilityText) || supplierStock === 0;
    const supplierStockRisk = supplierUnavailable || (supplierStock !== null && supplierStock <= Math.max(1, leadUnits + safetyUnits));

    const sourceCurrency = String(product.currency ?? currency).toUpperCase();
    const sourceCostMinor = money(product.sale_price ?? product.price);
    const sellingPriceMinor = money(product.selling_price);
    const comparableCurrency = sourceCurrency === currency;
    // Supplier product price is not a fully landed cost unless logistics evidence is present.
    const landedCostMinor: number | null = null;
    const contributionMarginBps = comparableCurrency && sourceCostMinor !== null && sellingPriceMinor !== null && sellingPriceMinor > 0
      ? Math.trunc(((sellingPriceMinor - sourceCostMinor - Math.floor(sellingPriceMinor / 100)) * 10_000) / sellingPriceMinor)
      : null;

    const campaign = campaigns.get(id);
    const conversionBps = campaign
      ? (int(campaign.impressions) > 0 ? Math.trunc((int(campaign.purchases) * 10_000_000) / int(campaign.impressions)) : 0)
      : null;

    const priorities: string[] = [];
    if (stock !== null && reorderUnits > 0) priorities.push("reorder");
    if (strategy !== "source_based" && stock === null) priorities.push("inventory_baseline_missing");
    if (supplierStockRisk) priorities.push("supplier_stock_risk");
    if (contributionMarginBps !== null && contributionMarginBps < 1500) priorities.push("margin_review");
    if (trend >= 1.25) priorities.push("scale_winner");
    if (trend <= 0.75 && sold30 > 0) priorities.push("declining_demand");
    if (conversionBps !== null && conversionBps < 100_000 && int(campaign?.clicks) > 20) priorities.push("conversion_review");
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
      sourceCurrency,
      sourceCostMinor,
      sellingPriceMinor,
      landedCostMinor,
      grossMarginBps: contributionMarginBps,
      marginBasis: "source_cost_plus_lunavo_1pct_fee; excludes unverified shipping, duties, taxes, provider fees, discounts, and returns",
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
      priorities,
      supplierFallback: null as SupplierFallback,
    };
  });

  const customerIntelligence = customers.map((customer) => {
    const id = int(customer.id);
    const data = customerOrders.get(id) ?? { count: 0, grossMinor: 0, lastDate: null, currencies: new Set<string>() };
    const recency = recencyDays(data.lastDate);
    const risk = churnRisk(data.count, recency);
    const seg = segment(data.count, data.grossMinor, recency);
    const marketingEligible = customer.marketing_consent === true;
    return {
      id,
      name: String(customer.name ?? ""),
      orderCount: data.count,
      grossMinor: data.grossMinor,
      averageOrderMinor: data.count > 0 ? Math.trunc(data.grossMinor / data.count) : 0,
      ltvMinor: data.grossMinor,
      recencyDays: recency,
      churnRiskBps: risk,
      segment: seg,
      nextBestAction: nextBestAction(seg, marketingEligible, risk),
      marketingEligible,
      currencies: [...data.currencies],
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
  const winners = productIntelligence.filter((x) => x.priorities.includes("scale_winner")).slice(0, 20);
  const automationCandidates = [
    ...reorderCandidates.slice(0, 10).map((product) => ({ kind: "inventory.reorder.review", productId: product.id, recommendedUnits: product.reorderUnits, requiresApproval: true })),
    ...supplierRiskProducts.slice(0, 10).map((product) => ({ kind: "supplier.stock-risk.review", productId: product.id, supplierStock: product.supplierStock, fallbackAvailable: Boolean(product.supplierFallback), requiresApproval: true })),
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
    summary: {
      productCount: productIntelligence.length,
      customerCount: customerIntelligence.length,
      reorderCandidateCount: reorderCandidates.length,
      decliningProductCount: productIntelligence.filter((x) => x.priorities.includes("declining_demand")).length,
      scaleWinnerCount: winners.length,
      atRiskCustomerCount: atRiskCustomers.length,
      topProducts,
      reorderCandidates,
      supplierRiskProducts,
      supplierStockRiskCount: supplierRiskProducts.length,
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
      "Margin is a partial estimate after the Lunavo 1% fee; it is not net profit or landed cost while logistics, tax, provider fees, discounts, and returns are missing.",
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
  const context = JSON.stringify({
    merchant: graph.merchant,
    summary: graph.summary,
    fulfillment: graph.fulfillment,
    graph: graph.graph,
    authorityRules: graph.authorityRules,
    question: question?.slice(0, 2000) ?? "How should the store improve profitable dropshipping operations next?",
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
