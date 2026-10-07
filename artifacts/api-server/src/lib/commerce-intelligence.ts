import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { completeLunavoBrain, type LunavoBrainRole } from "./ai-provider";

export type MerchantBrainFocus =
  | "all"
  | "sourcing"
  | "pricing"
  | "conversion"
  | "fulfillment"
  | "marketing"
  | "store-health"
  | "customer-retention";

type QueryResult = Record<string, unknown>;

async function safeRows(query: ReturnType<typeof sql>, label: string, gaps: string[]): Promise<QueryResult[]> {
  try {
    const result = await db.execute(query);
    return result.rows as QueryResult[];
  } catch {
    gaps.push(label);
    return [];
  }
}

function clampText(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

export async function buildMerchantIntelligenceSnapshot(merchantId: number) {
  if (!Number.isInteger(merchantId) || merchantId <= 0) throw new Error("Invalid merchant id");
  const gaps: string[] = [];

  const merchantRows = await safeRows(sql`
    SELECT id,name,store_name,currency,status,tax_rate,shipping_fee,free_shipping_threshold
    FROM merchants
    WHERE id=${merchantId} AND status='active'
    LIMIT 1
  `, "merchant profile", gaps);

  if (!merchantRows.length) throw new Error("Merchant workspace not found");

  const products = await safeRows(sql`
    SELECT id,title,category,brand,currency,price,sale_price,selling_price,availability,
           availability_quantity,status,visibility,marketplace_visibility,
           pricing_mode,profit_type,profit_value,source_domain,updated_at
    FROM supplier_products
    WHERE merchant_id=${merchantId}
    ORDER BY updated_at DESC
    LIMIT 40
  `, "catalog", gaps);

  const orders = await safeRows(sql`
    SELECT id,order_number,total,currency,status,quantity,fulfillment_status,
           supplier_payment_status,created_at,updated_at
    FROM orders
    WHERE merchant_id=${merchantId}
    ORDER BY created_at DESC
    LIMIT 100
  `, "orders", gaps);

  const customers = await safeRows(sql`
    SELECT id,name,email,marketing_consent,tags,created_at,updated_at
    FROM customers
    WHERE merchant_id=${merchantId}
    ORDER BY updated_at DESC
    LIMIT 100
  `, "customers", gaps);

  const campaigns = await safeRows(sql`
    SELECT id,product_id,status,payment_status,budget_minor,impressions,clicks,
           product_views,add_to_carts,purchases,attributed_revenue_minor,
           starts_at,ends_at,updated_at
    FROM product_advertising_campaigns
    WHERE merchant_id=${merchantId}
    ORDER BY updated_at DESC
    LIMIT 50
  `, "advertising", gaps);

  const sourcing = await safeRows(sql`
    SELECT id,title,source_currency,source_price_minor,source_availability,
           quality_score,opportunity_score,status,imported_product_id,updated_at
    FROM sourcing_products
    WHERE merchant_id=${merchantId}
    ORDER BY COALESCE(opportunity_score,0) DESC, updated_at DESC
    LIMIT 50
  `, "sourcing intelligence", gaps);

  const fulfillment = await safeRows(sql`
    SELECT status,COUNT(*)::int AS count
    FROM fulfillment_jobs
    WHERE merchant_id=${merchantId}
    GROUP BY status
    ORDER BY count DESC
  `, "fulfillment jobs", gaps);

  const opportunities = await safeRows(sql`
    SELECT type,priority,score,title,explanation,status,created_at,resolved_at
    FROM commerce_growth_opportunities
    WHERE merchant_id=${merchantId} AND status='open'
    ORDER BY COALESCE(score,0) DESC, created_at DESC
    LIMIT 30
  `, "growth opportunities", gaps);

  const health = await safeRows(sql`
    SELECT score,checks,generated_at
    FROM store_health_checks
    WHERE merchant_id=${merchantId}
    ORDER BY generated_at DESC
    LIMIT 1
  `, "store health", gaps);

  const orderStatusCounts = orders.reduce<Record<string, number>>((acc, row) => {
    const key = clampText(row.status, 60) ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const currencyTotals = orders.reduce<Record<string, number>>((acc, row) => {
    const currency = clampText(row.currency, 8) ?? "UNKNOWN";
    const value = Number(row.total);
    if (Number.isFinite(value)) acc[currency] = (acc[currency] ?? 0) + value;
    return acc;
  }, {});

  const campaignTotals = campaigns.reduce((acc, row) => ({
    impressions: acc.impressions + (Number(row.impressions) || 0),
    clicks: acc.clicks + (Number(row.clicks) || 0),
    views: acc.views + (Number(row.product_views) || 0),
    carts: acc.carts + (Number(row.add_to_carts) || 0),
    purchases: acc.purchases + (Number(row.purchases) || 0),
    revenueMinor: acc.revenueMinor + (Number(row.attributed_revenue_minor) || 0),
  }), { impressions: 0, clicks: 0, views: 0, carts: 0, purchases: 0, revenueMinor: 0 });

  return {
    generatedAt: new Date().toISOString(),
    merchant: merchantRows[0],
    catalog: products,
    orders: {
      recent: orders,
      statusCounts: orderStatusCounts,
      recordedGrossByCurrency: currencyTotals,
    },
    customers: {
      recent: customers,
      visibleCount: customers.length,
      marketingConsentCount: customers.filter((row) => row.marketing_consent === true).length,
    },
    marketing: { recentCampaigns: campaigns, totals: campaignTotals },
    sourcing: sourcing,
    fulfillment,
    opportunities,
    health: health[0] ?? null,
    evidenceGaps: gaps,
    authorityRules: [
      "Provider-verified payment and the internal ledger are financial truth.",
      "Server-side inventory state is stock truth; supplier availability is advisory until synchronized through an authoritative workflow.",
      "Source pages are authoritative only for fields explicitly extracted from the source; AI-generated enrichment never overrides source price, currency, availability or quantity.",
      "Ad metrics are authoritative only when recorded by an actual supported provider or Lunavo event pipeline.",
      "AI suggestions are recommendations until an existing approval/state-transition boundary records them.",
    ],
  };
}

function brainRolesForFocus(focus: MerchantBrainFocus): LunavoBrainRole[] {
  switch (focus) {
    case "sourcing": return ["researcher", "merchandiser", "growth", "reviewer"];
    case "pricing": return ["merchandiser", "growth", "researcher", "reviewer"];
    case "conversion": return ["merchandiser", "growth", "customer", "reviewer"];
    case "fulfillment": return ["operations", "growth", "customer", "reviewer"];
    case "marketing": return ["creative", "growth", "customer", "reviewer"];
    case "store-health": return ["orchestrator", "operations", "growth", "reviewer"];
    case "customer-retention": return ["customer", "growth", "merchandiser", "reviewer"];
    default: return ["orchestrator", "researcher", "growth", "operations", "reviewer"];
  }
}

export async function runMerchantBrain(input: {
  merchantId: number;
  goal?: string | null;
  question?: string | null;
  focus?: MerchantBrainFocus;
  productId?: number | null;
}) {
  const snapshot = await buildMerchantIntelligenceSnapshot(input.merchantId);
  const focus = input.focus ?? "all";
  const productId = Number.isInteger(input.productId) ? input.productId : null;

  const task = [
    "Produce the highest-leverage safe operating plan for this merchant.",
    "Goal: " + (clampText(input.goal, 500) || "Improve profitable commerce performance without compromising truth or safety."),
    "Question: " + (clampText(input.question, 2_000) || "What should Lunavo do next?"),
    "Focus: " + focus,
    productId === null ? "" : "Target product id: " + productId,
    "Return explicit cross-domain links showing how recommendations affect products, pricing, checkout, orders, inventory, suppliers, fulfillment, customers, marketing, analytics and automation where relevant.",
    "For every proposed action include evidence, expected benefit, dependencies, uncertainty, and whether merchant approval is required.",
    "Do not propose autonomous money movement, payout approval, provider confirmation, authoritative stock mutation or external publication.",
  ].filter(Boolean).join("\n");

  const brain = await completeLunavoBrain(
    task,
    JSON.stringify(snapshot),
    {
      json: true,
      roles: brainRolesForFocus(focus),
      maxTokens: 5_500,
      reasoningEffort: "high",
      contextLabel: "merchant operating graph",
    },
  );

  return {
    snapshot: {
      generatedAt: snapshot.generatedAt,
      evidenceGaps: snapshot.evidenceGaps,
      merchant: snapshot.merchant,
      health: snapshot.health,
      catalogCount: snapshot.catalog.length,
      recentOrderCount: snapshot.orders.recent.length,
      customerCount: snapshot.customers.visibleCount,
      openOpportunityCount: snapshot.opportunities.length,
    },
    brain,
  };
}
