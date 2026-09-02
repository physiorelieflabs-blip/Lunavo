import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  activityTable,
  aiActionsTable,
  aiModelsTable,
  aiSettingsTable,
  customersTable,
  db,
  ordersTable,
  supplierProductsTable,
  withdrawalsTable,
  type AiAction,
  type AiModel,
  type AiSettings,
} from "@workspace/db";

const PAID_STATUSES = ["paid", "fulfilled"] as const;
const MODEL_NAME = "commerce-signals";
const MODEL_VERSION = "1.0.0";

type MerchantContext = {
  id: number;
  currency: string;
  storeName: string;
};

type CommerceSnapshot = {
  revenue: number;
  currentRevenue: number;
  previousRevenue: number;
  orderCount: number;
  paidOrderCount: number;
  pendingOrderCount: number;
  customerCount: number;
  repeatCustomerCount: number;
  linkedOrderCount: number;
  fulfilledLinkedOrderCount: number;
  catalogCount: number;
  availableCatalogCount: number;
  reservedWithdrawal: number;
  trainingExamples: number;
};

function numberValue(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function periodStart(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * 86400000);
}

async function snapshot(merchant: MerchantContext): Promise<CommerceSnapshot> {
  const currentStart = periodStart(30);
  const previousStart = periodStart(60);
  const [summary] = await db
    .select({
      revenue: sql<string>`coalesce(sum(${ordersTable.total}) filter (where ${ordersTable.status} in ('paid', 'fulfilled') and ${ordersTable.currency} = ${merchant.currency}), 0)`,
      currentRevenue: sql<string>`coalesce(sum(${ordersTable.total}) filter (where ${ordersTable.status} in ('paid', 'fulfilled') and ${ordersTable.currency} = ${merchant.currency} and ${ordersTable.createdAt} >= ${currentStart}), 0)`,
      previousRevenue: sql<string>`coalesce(sum(${ordersTable.total}) filter (where ${ordersTable.status} in ('paid', 'fulfilled') and ${ordersTable.currency} = ${merchant.currency} and ${ordersTable.createdAt} >= ${previousStart} and ${ordersTable.createdAt} < ${currentStart}), 0)`,
      orderCount: sql<string>`count(*) filter (where ${ordersTable.status} <> 'cancelled')`,
      paidOrderCount: sql<string>`count(*) filter (where ${inArray(ordersTable.status, [...PAID_STATUSES])} and ${ordersTable.currency} = ${merchant.currency})`,
      pendingOrderCount: sql<string>`count(*) filter (where ${ordersTable.status} = 'pending')`,
      linkedOrderCount: sql<string>`count(*) filter (where ${ordersTable.supplierProductId} is not null)`,
      fulfilledLinkedOrderCount: sql<string>`count(*) filter (where ${ordersTable.supplierProductId} is not null and ${ordersTable.fulfillmentStatus} = 'fulfilled')`,
    })
    .from(ordersTable)
    .where(eq(ordersTable.merchantId, merchant.id));

  const [customers] = await db
    .select({ customerCount: sql<string>`count(*)` })
    .from(customersTable)
    .where(eq(customersTable.merchantId, merchant.id));

  const customerOrders = await db
    .select({
      customerId: ordersTable.customerId,
      count: sql<string>`count(*) filter (where ${ordersTable.status} <> 'cancelled')`,
    })
    .from(ordersTable)
    .where(eq(ordersTable.merchantId, merchant.id))
    .groupBy(ordersTable.customerId);

  const [catalog] = await db
    .select({
      catalogCount: sql<string>`count(*)`,
      availableCatalogCount: sql<string>`count(*) filter (where ${supplierProductsTable.inventoryStatus} in ('available', 'in_stock'))`,
    })
    .from(supplierProductsTable)
    .where(eq(supplierProductsTable.merchantId, merchant.id));

  const [withdrawals] = await db
    .select({
      reserved: sql<string>`coalesce(sum(${withdrawalsTable.amount}) filter (where ${withdrawalsTable.status} in ('pending', 'approved', 'paid') and ${withdrawalsTable.currency} = ${merchant.currency}), 0)`,
    })
    .from(withdrawalsTable)
    .where(eq(withdrawalsTable.merchantId, merchant.id));

  const [activity] = await db
    .select({ count: sql<string>`count(*)` })
    .from(activityTable)
    .where(eq(activityTable.merchantId, merchant.id));

  return {
    revenue: numberValue(summary?.revenue),
    currentRevenue: numberValue(summary?.currentRevenue),
    previousRevenue: numberValue(summary?.previousRevenue),
    orderCount: Number(summary?.orderCount ?? 0),
    paidOrderCount: Number(summary?.paidOrderCount ?? 0),
    pendingOrderCount: Number(summary?.pendingOrderCount ?? 0),
    customerCount: Number(customers?.customerCount ?? 0),
    repeatCustomerCount: customerOrders.filter((row) => Number(row.count) > 1).length,
    linkedOrderCount: Number(summary?.linkedOrderCount ?? 0),
    fulfilledLinkedOrderCount: Number(summary?.fulfilledLinkedOrderCount ?? 0),
    catalogCount: Number(catalog?.catalogCount ?? 0),
    availableCatalogCount: Number(catalog?.availableCatalogCount ?? 0),
    reservedWithdrawal: numberValue(withdrawals?.reserved),
    trainingExamples:
      Number(summary?.paidOrderCount ?? 0) +
      Number(customers?.customerCount ?? 0) +
      Number(activity?.count ?? 0),
  };
}

async function ensureSettings(merchantId: number): Promise<AiSettings> {
  const existing = (
    await db
      .select()
      .from(aiSettingsTable)
      .where(eq(aiSettingsTable.merchantId, merchantId))
      .limit(1)
  )[0];
  if (existing) return existing;
  const [created] = await db
    .insert(aiSettingsTable)
    .values({ merchantId })
    .onConflictDoNothing({ target: aiSettingsTable.merchantId })
    .returning();
  if (created) return created;
  const [raced] = await db
    .select()
    .from(aiSettingsTable)
    .where(eq(aiSettingsTable.merchantId, merchantId))
    .limit(1);
  if (!raced) throw new Error("AI settings could not be initialized");
  return raced;
}

async function ensureModel(merchantId: number): Promise<AiModel> {
  const [existing] = await db
    .select()
    .from(aiModelsTable)
    .where(
      and(
        eq(aiModelsTable.merchantId, merchantId),
        eq(aiModelsTable.name, MODEL_NAME),
        eq(aiModelsTable.version, MODEL_VERSION),
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(aiModelsTable)
    .values({
      merchantId,
      name: MODEL_NAME,
      version: MODEL_VERSION,
      modelType: "local_commerce_signals",
      status: "untrained",
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [raced] = await db
    .select()
    .from(aiModelsTable)
    .where(
      and(
        eq(aiModelsTable.merchantId, merchantId),
        eq(aiModelsTable.name, MODEL_NAME),
        eq(aiModelsTable.version, MODEL_VERSION),
      ),
    )
    .limit(1);
  if (!raced) throw new Error("AI model could not be initialized");
  return raced;
}

function modelScore(data: CommerceSnapshot): number | null {
  if (data.trainingExamples < 3) return null;
  const current = Math.max(data.currentRevenue, 0);
  const previous = Math.max(data.previousRevenue, 0);
  const stability = 1 - Math.abs(current - previous) / Math.max(current, previous, 1);
  const fulfillment =
    data.linkedOrderCount === 0
      ? 1
      : data.fulfilledLinkedOrderCount / data.linkedOrderCount;
  return round(clamp(0.45 + stability * 0.3 + fulfillment * 0.25, 0, 0.99), 4);
}

function trainedWeights(data: CommerceSnapshot) {
  const trend =
    data.previousRevenue === 0
      ? data.currentRevenue > 0
        ? 1
        : 0
      : clamp(data.currentRevenue / data.previousRevenue - 1, -1, 2);
  const fulfillment =
    data.linkedOrderCount === 0
      ? 1
      : data.fulfilledLinkedOrderCount / data.linkedOrderCount;
  const repeatRate =
    data.customerCount === 0
      ? 0
      : data.repeatCustomerCount / data.customerCount;
  return {
    featureVersion: "commerce-signals-v1",
    revenueTrend30d: round(trend, 4),
    fulfillmentRate: round(fulfillment, 4),
    repeatCustomerRate: round(repeatRate, 4),
    availableCatalogRate:
      data.catalogCount === 0
        ? 0
        : round(data.availableCatalogCount / data.catalogCount, 4),
    next30DayRevenue: round(Math.max(0, data.currentRevenue * (1 + trend)), 2),
  };
}

function serializeModel(model: AiModel) {
  return {
    id: model.id,
    name: model.name,
    version: model.version,
    modelType: model.modelType,
    status: model.status,
    trainingExamples: model.trainingExamples,
    evaluationScore:
      model.evaluationScore === null ? null : numberValue(model.evaluationScore),
    trainedAt: model.trainedAt,
  };
}

function serializeSettings(settings: AiSettings) {
  return {
    autonomyLevel: settings.autonomyLevel,
    runMyBusiness: settings.runMyBusiness,
    trainingOptIn: settings.trainingOptIn,
  };
}

export function serializeAiAction(action: AiAction) {
  return {
    id: action.id,
    agent: action.agent,
    actionType: action.actionType,
    title: action.title,
    reason: action.reason,
    status: action.status,
    risk: action.risk,
    reversible: action.reversible,
    approvalRequired: action.approvalRequired,
    rollbackAvailable: action.rollbackAvailable,
    createdAt: action.createdAt,
    approvedAt: action.approvedAt,
    executedAt: action.executedAt,
    rolledBackAt: action.rolledBackAt,
    result: action.result,
  };
}

export async function getAiSettingsForMerchant(merchantId: number) {
  return serializeSettings(await ensureSettings(merchantId));
}

export async function trainMerchantAiModel(merchant: MerchantContext) {
  const data = await snapshot(merchant);
  const score = modelScore(data);
  const [model] = await db
    .insert(aiModelsTable)
    .values({
      merchantId: merchant.id,
      name: MODEL_NAME,
      version: MODEL_VERSION,
      modelType: "local_commerce_signals",
      status: score === null ? "insufficient_data" : "trained",
      trainingExamples: data.trainingExamples,
      evaluationScore: score === null ? null : score.toFixed(4),
      weights: trainedWeights(data),
      trainedAt: score === null ? null : new Date(),
    })
    .onConflictDoUpdate({
      target: [
        aiModelsTable.merchantId,
        aiModelsTable.name,
        aiModelsTable.version,
      ],
      set: {
        status: score === null ? "insufficient_data" : "trained",
        trainingExamples: data.trainingExamples,
        evaluationScore: score === null ? null : score.toFixed(4),
        weights: trainedWeights(data),
        trainedAt: score === null ? null : new Date(),
      },
    })
    .returning();
  if (!model) throw new Error("AI model training did not produce a model");
  return serializeModel(model);
}

export async function getAiOverviewForMerchant(merchant: MerchantContext) {
  const [model, settings, data] = await Promise.all([
    ensureModel(merchant.id),
    ensureSettings(merchant.id),
    snapshot(merchant),
  ]);
  const revenueChange =
    data.previousRevenue === 0
      ? data.currentRevenue > 0
        ? 100
        : 0
      : Math.round(
          ((data.currentRevenue - data.previousRevenue) /
            data.previousRevenue) *
            100,
        );
  const conversionHealth = data.orderCount === 0
    ? 0
    : clamp((data.paidOrderCount / data.orderCount) * 100, 0, 100);
  const fulfillmentHealth = data.linkedOrderCount === 0
    ? 100
    : clamp(
        (data.fulfilledLinkedOrderCount / data.linkedOrderCount) * 100,
        0,
        100,
      );
  const customerHealth = data.customerCount === 0
    ? 0
    : clamp(
        55 +
          (data.repeatCustomerCount / data.customerCount) * 45,
        0,
        100,
      );
  const healthScore = data.orderCount === 0
    ? 0
    : Math.round(
        conversionHealth * 0.35 +
          fulfillmentHealth * 0.35 +
          customerHealth * 0.3,
      );
  const brief = data.orderCount === 0
    ? "No commerce history is recorded yet. Add a real sale or share your checkout link to give the local signals model evidence."
    : `${data.paidOrderCount} paid orders generated ${merchant.currency} ${data.revenue.toFixed(2)}. Revenue is ${revenueChange >= 0 ? "up" : "down"} ${Math.abs(revenueChange)}% versus the prior 30-day period; ${data.pendingOrderCount} order${data.pendingOrderCount === 1 ? "" : "s"} still need attention.`;

  const signals = data.orderCount === 0
    ? [{
        title: "Waiting for first-party data",
        detail: "Predictions are paused until this workspace has real orders or customer activity.",
        severity: "info",
        agent: "Business analyst",
      }]
    : [
        ...(data.pendingOrderCount > 0
          ? [{
              title: `${data.pendingOrderCount} payment${data.pendingOrderCount === 1 ? "" : "s"} need confirmation`,
              detail: "Pending checkout orders are excluded from paid revenue until you confirm or cancel them.",
              severity: "warning",
              agent: "Revenue agent",
            }]
          : []),
        ...(data.linkedOrderCount > data.fulfilledLinkedOrderCount
          ? [{
              title: "Fulfillment queue has open work",
              detail: `${data.linkedOrderCount - data.fulfilledLinkedOrderCount} supplier-linked order${data.linkedOrderCount - data.fulfilledLinkedOrderCount === 1 ? "" : "s"} are not marked fulfilled.`,
              severity: "warning",
              agent: "Operations agent",
            }]
          : []),
        ...(revenueChange < 0
          ? [{
              title: "Revenue momentum softened",
              detail: `Recorded revenue is ${Math.abs(revenueChange)}% below the previous 30-day period.`,
              severity: "attention",
              agent: "Revenue agent",
            }]
          : []),
      ];

  const recommendations = data.orderCount === 0
    ? [{
        id: "first-sale",
        title: "Create a real sales signal",
        detail: "Record a paid sale or send customers to public checkout.",
        reason: "The AI layer only learns from persisted workspace activity.",
        agent: "Business analyst",
        risk: "low",
        reversible: true,
      }]
    : [
        ...(data.pendingOrderCount > 0
          ? [{
              id: "review-pending-orders",
              title: "Review pending checkout",
              detail: `Resolve ${data.pendingOrderCount} pending order${data.pendingOrderCount === 1 ? "" : "s"} so the ledger reflects confirmed payments.`,
              reason: "Unresolved checkouts should not be treated as paid revenue.",
              agent: "Revenue agent",
              risk: "low",
              reversible: true,
            }]
          : []),
        ...(data.availableCatalogCount < data.catalogCount
          ? [{
              id: "review-catalog-availability",
              title: "Review catalog availability",
              detail: `${data.catalogCount - data.availableCatalogCount} catalog item${data.catalogCount - data.availableCatalogCount === 1 ? "" : "s"} are not currently available.`,
              reason: "Unavailable supplier inventory can create avoidable fulfillment risk.",
              agent: "Catalog agent",
              risk: "medium",
              reversible: true,
            }]
          : []),
      ];

  const agents = [
    {
      key: "revenue",
      name: "Revenue agent",
      focus: "Sales and payment signals",
      status: data.orderCount ? "monitoring" : "waiting_for_data",
      insight: `${merchant.currency} ${data.currentRevenue.toFixed(2)} recorded in the last 30 days.`,
    },
    {
      key: "customer",
      name: "Customer agent",
      focus: "Retention and buyer patterns",
      status: data.customerCount ? "monitoring" : "waiting_for_data",
      insight: `${data.repeatCustomerCount} repeat customer${data.repeatCustomerCount === 1 ? "" : "s"} detected from persisted orders.`,
    },
    {
      key: "operations",
      name: "Operations agent",
      focus: "Supplier fulfillment risk",
      status: data.linkedOrderCount ? "monitoring" : "quiet",
      insight: `${Math.max(0, data.linkedOrderCount - data.fulfilledLinkedOrderCount)} linked order${data.linkedOrderCount - data.fulfilledLinkedOrderCount === 1 ? "" : "s"} remain open.`,
    },
    {
      key: "cash",
      name: "Cash agent",
      focus: "Withdrawals and available funds",
      status: "guarded",
      insight: `${merchant.currency} ${data.reservedWithdrawal.toFixed(2)} is reserved in payout requests.`,
    },
  ];

  const [awaiting] = await db
    .select({ count: sql<string>`count(*)` })
    .from(aiActionsTable)
    .where(
      and(
        eq(aiActionsTable.merchantId, merchant.id),
        eq(aiActionsTable.status, "awaiting_approval"),
      ),
    );

  return {
    model: serializeModel(model),
    settings: serializeSettings(settings),
    healthScore,
    brief,
    metrics: [
      {
        key: "revenue",
        label: "Recorded revenue",
        value: round(data.revenue),
        detail: `${merchant.currency}; paid and fulfilled orders only`,
      },
      {
        key: "revenue_change",
        label: "30-day change",
        value: revenueChange,
        detail: "Compared with the previous 30-day period",
      },
      {
        key: "average_order",
        label: "Average paid order",
        value: round(
          data.paidOrderCount ? data.revenue / data.paidOrderCount : 0,
        ),
        detail: `${data.paidOrderCount} paid orders in ${merchant.currency}`,
      },
      {
        key: "repeat_customer_rate",
        label: "Repeat customer rate",
        value: round(
          data.customerCount
            ? (data.repeatCustomerCount / data.customerCount) * 100
            : 0,
        ),
        detail: "Customers with more than one non-cancelled order",
      },
    ],
    signals,
    recommendations,
    agents,
    awaitingApproval: Number(awaiting?.count ?? 0),
  };
}

export async function listAiActionsForMerchant(merchantId: number) {
  const actions = await db
    .select()
    .from(aiActionsTable)
    .where(eq(aiActionsTable.merchantId, merchantId))
    .orderBy(desc(aiActionsTable.createdAt))
    .limit(100);
  return actions.map(serializeAiAction);
}

export async function getAiActionForMerchant(merchantId: number, id: number) {
  const [action] = await db
    .select()
    .from(aiActionsTable)
    .where(and(eq(aiActionsTable.id, id), eq(aiActionsTable.merchantId, merchantId)))
    .limit(1);
  return action;
}

export async function allowedActionType(actionType: string): Promise<boolean> {
  return [
    "prepare_report",
    "draft_message",
    "inventory_review",
    "catalog_review",
    "fulfillment_review",
    "ad_draft",
  ].includes(actionType);
}

export { ensureSettings, ensureModel, serializeModel, serializeSettings };