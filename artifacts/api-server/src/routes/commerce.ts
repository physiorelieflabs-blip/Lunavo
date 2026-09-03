import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { createClerkClient, getAuth } from "@clerk/express";
import {
  activityTable,
  aiActionsTable,
  aiSettingsTable,
  customersTable,
  db,
  merchantBankAccountsTable,
  merchantsTable,
  ordersTable,
  paymentsTable,
  paymentIntentsTable,
  paymentRecordsTable,
  ledgerEntriesTable,
  refundRecordsTable,
  commerceTransitionHistoryTable,
  reconciliationRecordsTable,
  supplierProductsTable,
  supplierImportAttemptsTable,
  supplierImportBatchesTable,
  suppliersTable,
  subscriptionsTable,
  withdrawalSecurityTable,
  withdrawalsTable,
  inventoryReservationsTable,
  inventoryMovementsTable,
} from "@workspace/db";
import {
  BeginWithdrawalSecuritySetupResponse,
  ConfirmWithdrawalSecuritySetupBody,
  ConfirmWithdrawalSecuritySetupResponse,
  CreateOrderBody,
  CreateOrderResponse,
  CreatePublicCheckoutBody,
  CreatePublicCheckoutParams,
  CreatePublicCheckoutResponse,
  CreateSupplierPaymentBody,
  CreateSupplierPaymentParams,
  CreateSupplierPaymentResponse,
  CreateSubscriptionBody,
  CreateSubscriptionResponse,
  UpdateDropshipStatusBody,
  GetAdminOverviewResponse,
  GetDashboardOverviewResponse,
  GetCurrencySettingsResponse,
  GetCheckoutSettingsResponse,
  GetMarketExchangeRateResponse,
  CreateStoreBody,
  CreateStoreResponse,
  GetLinkedBankAccountResponse,
  GetPublicStoreParams,
  GetPublicStoreResponse,
  GetSubscriptionResponse,
  GetWithdrawalSecurityResponse,
  ImportSupplierProductBody,
  ImportSupplierProductResponse,
  AnalyzeSupplierProductBody,
  AnalyzeSupplierProductResponse,
  ImportSupplierProductBatchBody,
  ImportSupplierProductBatchResponse,
  CreateManualSupplierProductBody,
  CreateManualSupplierProductResponse,
  RefreshSupplierProductParams,
  RefreshSupplierProductResponse,
  AcceptSupplierRefreshParams,
  AcceptSupplierRefreshBody,
  AcceptSupplierRefreshResponse,
  UpdateSupplierProductParams,
  UpdateSupplierProductBody,
  UpdateSupplierProductResponse,
  ListSupplierImportHistoryResponse,
  ListSuppliersResponse,
  UpdateSupplierParams,
  UpdateSupplierBody,
  UpdateSupplierResponse,
  ListAdminWithdrawalsResponse,
  ListMarketplaceProductsResponse,
  ListCustomersResponse,
  UpdateCustomerBody,
  UpdateCustomerParams,
  UpdateCustomerResponse,
  ListDashboardActivityResponse,
  ListDropshipQueueResponse,
  ListOrdersResponse,
  ListSupplierProductsResponse,
  ListWithdrawalsResponse,
  ListMerchantsResponse,
  PaySubscriptionFromEarningsResponse,
  CreateWithdrawalBody,
  CreateWithdrawalResponse,
  SetWithdrawalPinsBody,
  SetWithdrawalPinsResponse,
  RevealWithdrawalDetailsBody,
  RevealWithdrawalDetailsParams,
  RevealWithdrawalDetailsResponse,
  ReviewBankTransferBody,
  ReviewBankTransferParams,
  ReviewBankTransferResponse,
  ReviewWithdrawalBody,
  ReviewWithdrawalParams,
  ReviewWithdrawalResponse,
  SaveLinkedBankAccountBody,
  SaveLinkedBankAccountResponse,
  SubmitBankTransferBody,
  SubmitBankTransferResponse,
  UpdateMerchantStatusBody,
  UpdateMerchantStatusParams,
  UpdateMerchantStatusResponse,
  UpdateCurrencySettingsBody,
  UpdateCurrencySettingsResponse,
  UpdateCheckoutSettingsBody,
  UpdateCheckoutSettingsResponse,
  UpdateOrderStatusBody,
  UpdateOrderStatusParams,
  UpdateOrderStatusResponse,
  UpdateDropshipStatusParams,
  UpdateDropshipStatusResponse,
  GetAiOverviewResponse,
  TrainAiModelResponse,
  GetAiSettingsResponse,
  UpdateAiSettingsBody,
  UpdateAiSettingsResponse,
  ListAiActionsResponse,
  CreateAiActionBody,
  CreateAiActionResponse,
  ApproveAiActionParams,
  ApproveAiActionResponse,
  RejectAiActionParams,
  RejectAiActionResponse,
  ExecuteAiActionParams,
  ExecuteAiActionResponse,
  RollbackAiActionParams,
  RollbackAiActionResponse,
  ResearchWebBody,
  ResearchWebResponse,
  CreatePaymentIntentBody,
  CreatePaymentIntentResponse,
  CreatePaymentIntentHeader,
  VerifyPaymentBody,
  VerifyPaymentResponse,
  GetMerchantBalancesResponse,
  CreateRefundBody,
  CreateRefundResponse,
  ApproveRefundResponse,
  CreateReconciliationBody,
  CreateReconciliationResponse,
  ListReconciliationsResponse,
  UpdateReconciliationBody,
  UpdateReconciliationResponse,
  ListInventoryReservationsResponse,
  ListInventoryMovementsResponse,
  CreateInventoryAdjustmentBody,
  CreateInventoryAdjustmentResponse,
} from "@workspace/api-zod";
import {
  createTotpUri,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  verifyTotp,
} from "../lib/withdrawal-security";
import {
  importPublicSupplierProduct,
  type ImportedSupplierProduct,
} from "../lib/public-supplier";
import {
  allowedActionType,
  getAiActionForMerchant,
  getAiOverviewForMerchant,
  getAiSettingsForMerchant,
  listAiActionsForMerchant,
  serializeAiAction,
  trainMerchantAiModel,
} from "../lib/ai";

const router: IRouter = Router();
const ADMIN_EMAIL = "ifeoluwaolowu4@gmail.com";
const SUPPORTED_CURRENCIES = [
  "USD",
  "NGN",
  "GHS",
  "KES",
  "ZAR",
  "GBP",
  "EUR",
  "CAD",
  "AUD",
] as const;
const MONTHLY_FEE = 30;
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const SUPPLIER_IMPORT_WINDOW_MS = 10 * 60 * 1000;
const SUPPLIER_IMPORT_LIMIT = 60;
const supplierImportQuota = new Map<string, { startedAt: number; count: number }>();
const fxCache = new Map<string, { expiresAt: number; payload: { base: string; quote: string; rate: number; source: string; fetchedAt: string; asOf: string | null } }>();

function consumeSupplierImportQuota(clerkUserId: string, requested: number): boolean {
  const now = Date.now();
  const current = supplierImportQuota.get(clerkUserId);
  if (!current || now - current.startedAt >= SUPPLIER_IMPORT_WINDOW_MS) {
    supplierImportQuota.set(clerkUserId, { startedAt: now, count: requested });
    return requested <= SUPPLIER_IMPORT_LIMIT;
  }
  if (current.count + requested > SUPPLIER_IMPORT_LIMIT) return false;
  current.count += requested;
  return true;
}

type Identity = {
  clerkUserId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  isAdmin: boolean;
};

type Merchant = typeof merchantsTable.$inferSelect;
type Subscription = typeof subscriptionsTable.$inferSelect;
type Payment = typeof paymentsTable.$inferSelect;
type Customer = typeof customersTable.$inferSelect;
type Order = typeof ordersTable.$inferSelect;
type Withdrawal = typeof withdrawalsTable.$inferSelect;
type MerchantBankAccount = typeof merchantBankAccountsTable.$inferSelect;
type Supplier = typeof suppliersTable.$inferSelect;

function toNumber(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function normalizeCustomerTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""').replaceAll("\r", " ").replaceAll("\n", " ")}"`;
}

function csvDocument(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function daysSince(date: Date): number {
  return Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

function storeSlug(storeName: string): string {
  return (
    storeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "store"
  );
}

function isSupportedCurrency(value: string): boolean {
  return SUPPORTED_CURRENCIES.includes(
    value as (typeof SUPPORTED_CURRENCIES)[number],
  );
}

async function getIdentity(req: Request): Promise<Identity | null> {
  const auth = getAuth(req);
  if (!auth?.userId) return null;

  const user = await clerk.users.getUser(auth.userId);
  const primary =
    user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    ) ?? user.emailAddresses[0];
  const email = primary?.emailAddress.toLowerCase();
  const emailVerified = primary?.verification?.status === "verified";
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    undefined;

  if (!email) {
    throw new Error("Authenticated Clerk user has no email address");
  }

  return {
    clerkUserId: auth.userId,
    email,
    name: name || email.split("@")[0],
    emailVerified,
    isAdmin: email === ADMIN_EMAIL && emailVerified,
  };
}

async function requireIdentity(req: Request, res: Response) {
  const identity = await getIdentity(req);
  if (!identity) {
    res.status(401).json({ error: "Sign in required" });
    return null;
  }
  return identity;
}

async function requireAdmin(req: Request, res: Response) {
  const identity = await requireIdentity(req, res);
  if (!identity) return null;
  if (!identity.isAdmin) {
    res.status(403).json({ error: "Master admin access required" });
    return null;
  }
  return identity;
}

async function getOrCreateMerchant(identity: Identity): Promise<Merchant> {
  let merchant = (
    await db
      .select()
      .from(merchantsTable)
      .where(eq(merchantsTable.clerkUserId, identity.clerkUserId))
      .limit(1)
  )[0];

  if (!merchant) {
    merchant = (
      await db
        .select()
        .from(merchantsTable)
        .where(
          and(
            eq(merchantsTable.email, identity.email),
            isNull(merchantsTable.clerkUserId),
          ),
        )
        .limit(1)
    )[0];
  }

  if (merchant) {
    if (
      merchant.clerkUserId === null &&
      !identity.emailVerified
    ) {
      throw new Error("A verified email is required to claim this account");
    }
    if (
      merchant.clerkUserId !== identity.clerkUserId ||
      merchant.name !== identity.name ||
      merchant.email !== identity.email
    ) {
      [merchant] = await db
        .update(merchantsTable)
        .set({
          clerkUserId: identity.clerkUserId,
          name: identity.name,
          email: identity.email,
        })
        .where(eq(merchantsTable.id, merchant.id))
        .returning();
    }
    await getSubscriptionForMerchant(merchant, identity.isAdmin);
    return merchant;
  }

  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(merchantsTable)
      .values({
        clerkUserId: identity.clerkUserId,
        name: identity.name,
        email: identity.email,
        storeName: identity.isAdmin ? "TS Commerce" : `${identity.name}'s Store`,
      })
      .onConflictDoNothing()
      .returning();
    const created =
      inserted ??
      (
        await tx
          .select()
          .from(merchantsTable)
          .where(eq(merchantsTable.clerkUserId, identity.clerkUserId))
          .limit(1)
      )[0];
    if (!created) throw new Error("Could not create merchant account");
    await tx.insert(subscriptionsTable).values({
      merchantId: created.id,
      amountDue: identity.isAdmin ? "0" : MONTHLY_FEE.toFixed(2),
      status: identity.isAdmin ? "active" : "pending",
    }).onConflictDoNothing({ target: subscriptionsTable.merchantId });
    return created;
  });
}

async function getSubscriptionForMerchant(
  merchant: Merchant,
  isAdmin = false,
): Promise<Subscription> {
  let subscription = (
    await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.merchantId, merchant.id))
      .limit(1)
  )[0];
  if (!subscription) {
    [subscription] = await db
      .insert(subscriptionsTable)
      .values({
        merchantId: merchant.id,
        amountDue: isAdmin ? "0" : MONTHLY_FEE.toFixed(2),
        status: isAdmin ? "active" : "pending",
      })
      .onConflictDoNothing({ target: subscriptionsTable.merchantId })
      .returning();
    if (!subscription) {
      subscription = (
        await db
          .select()
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.merchantId, merchant.id))
          .limit(1)
      )[0];
    }
  }
  const requiredAmount = isAdmin ? 0 : MONTHLY_FEE;
  if (toNumber(subscription.amountDue) !== requiredAmount) {
    [subscription] = await db
      .update(subscriptionsTable)
      .set({
        amountDue: requiredAmount.toFixed(2),
        status:
          isAdmin || toNumber(subscription.amountPaid) >= requiredAmount
            ? "active"
            : subscription.status === "expired"
              ? "expired"
              : "pending",
      })
      .where(eq(subscriptionsTable.id, subscription.id))
      .returning();
  }
  return subscription;
}

async function addActivity(
  merchantId: number,
  values: Omit<
    typeof activityTable.$inferInsert,
    "merchantId" | "occurredAt" | "id"
  >,
) {
  await db.insert(activityTable).values({ merchantId, ...values });
}

async function enforceSubscription(merchant: Merchant, isAdmin = false) {
  let subscription = await getSubscriptionForMerchant(merchant, isAdmin);
  if (isAdmin) {
    if (
      toNumber(subscription.amountDue) !== 0 ||
      subscription.status !== "active"
    ) {
      [subscription] = await db
        .update(subscriptionsTable)
        .set({ amountDue: "0", amountPaid: "0", status: "active" })
        .where(eq(subscriptionsTable.id, subscription.id))
        .returning();
    }
    return { merchant, subscription };
  }

  const remaining = Math.max(
    0,
    toNumber(subscription.amountDue) - toNumber(subscription.amountPaid),
  );
  const days = daysSince(merchant.registeredAt);

  if (remaining === 0 && subscription.status !== "active") {
    [subscription] = await db
      .update(subscriptionsTable)
      .set({ status: "active" })
      .where(eq(subscriptionsTable.id, subscription.id))
      .returning();
  } else if (remaining > 0 && days >= 15) {
    const wasSuspended = merchant.status === "suspended";
    if (!wasSuspended && merchant.status !== "banned") {
      [merchant] = await db
        .update(merchantsTable)
        .set({ status: "suspended" })
        .where(eq(merchantsTable.id, merchant.id))
        .returning();
      await addActivity(merchant.id, {
        type: "subscription_suspended",
        title: "Account suspended",
        description:
          "The platform fee was not settled by day 15. A verified payment restores access.",
        amount: remaining.toFixed(2),
        tone: "negative",
      });
    }
    if (subscription.status !== "expired") {
      [subscription] = await db
        .update(subscriptionsTable)
        .set({ status: "expired" })
        .where(eq(subscriptionsTable.id, subscription.id))
        .returning();
    }
  } else if (
    remaining > 0 &&
    days >= 10 &&
    subscription.status === "pending"
  ) {
    [subscription] = await db
      .update(subscriptionsTable)
      .set({ status: "past_due" })
      .where(eq(subscriptionsTable.id, subscription.id))
      .returning();
    await addActivity(merchant.id, {
      type: "subscription_warning",
      title: "Platform fee reminder",
      description: `Your platform fee must be settled within ${15 - days} days to avoid suspension.`,
      amount: remaining.toFixed(2),
      tone: "warning",
    });
  }
  return { merchant, subscription };
}

function serializeSubscription(
  merchant: Merchant,
  subscription: Subscription,
  isAdmin = false,
) {
  const serverNow = new Date();
  const days = daysSince(merchant.registeredAt);
  const trialEndsAt = new Date(
    merchant.registeredAt.getTime() + 15 * 24 * 60 * 60 * 1000,
  );
  const daysRemaining = Math.max(0, 15 - days);
  const admin = isAdmin;
  const paid = toNumber(subscription.amountPaid);
  const remaining = Math.max(0, toNumber(subscription.amountDue) - paid);
  let nextAction = admin
    ? "Master admin account — subscription exempt"
    : remaining === 0
      ? "Subscription settled"
      : `Apply $${remaining.toFixed(2)} from earnings or submit a bank transfer`;
  if (!admin && days >= 10 && days < 15 && remaining > 0) {
    nextAction = `Warning: ${15 - days} days left to settle your subscription`;
  }
  if (!admin && days >= 15 && remaining > 0) {
    nextAction =
      "Account suspended — submit a bank transfer for admin review to restore access";
  }
  return {
    id: subscription.id,
    email: merchant.email,
    isAdmin: admin,
    amountDue: toNumber(subscription.amountDue),
    amountPaid: paid,
    earningsHeld: toNumber(subscription.earningsHeld),
    status:
      admin || remaining === 0
        ? "active"
        : merchant.status === "suspended"
          ? "suspended"
          : subscription.status,
    registeredAt: merchant.registeredAt,
    warningDay: 10,
    suspensionDay: 15,
    serverNow,
    trialEndsAt,
    daysElapsed: days,
    daysRemaining,
    nextAction,
    paymentMethod: subscription.paymentMethod,
  };
}

function serializePayment(payment: Payment, merchantName: string) {
  return {
    id: payment.id,
    merchantName,
    amount: toNumber(payment.amount),
    currency: payment.currency,
    method: payment.method,
    reference: payment.reference,
    senderName: payment.senderName,
    status: payment.status,
    reviewNote: payment.reviewNote,
    reviewedAt: payment.reviewedAt,
    createdAt: payment.createdAt,
  };
}

function calculateSellingPrice(
  cost: string | number | null,
  profitType: string,
  profitValue: string | number,
  pricingMode = profitType === "percentage" ? "percentage_markup" : "fixed_markup",
  customSellingPrice: string | number | null | undefined = null,
): number | null {
  if (pricingMode === "custom") {
    return customSellingPrice === null || customSellingPrice === undefined
      ? null
      : Number(toNumber(customSellingPrice).toFixed(2));
  }
  if (cost === null) return null;
  const costAmount = toNumber(cost);
  if (pricingMode === "same_price") return Number(costAmount.toFixed(2));
  const profitAmount =
    pricingMode === "percentage_markup" || profitType === "percentage"
      ? (costAmount * toNumber(profitValue)) / 100
      : toNumber(profitValue);
  return Number((costAmount + profitAmount).toFixed(2));
}

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function serializeSupplierPreview(imported: Awaited<ReturnType<typeof importPublicSupplierProduct>>) {
  return {
    sourceUrl: imported.sourceUrl,
    sourceDomain: imported.sourceDomain,
    title: imported.title,
    description: imported.description,
    imageUrl: imported.imageUrl,
    imageUrls: imported.imageUrls,
    videoUrls: imported.videoUrls,
    price: imported.price === null ? null : toNumber(imported.price),
    salePrice: imported.salePrice === null ? null : toNumber(imported.salePrice),
    currency: imported.currency,
    sku: imported.sku,
    sourceProductId: imported.sourceProductId,
    variants: imported.variants,
    attributes: imported.attributes,
    availability: imported.availability,
    availabilityQuantity: imported.availabilityQuantity,
    category: imported.category,
    specifications: imported.specifications,
    brand: imported.brand,
    shippingInformation: imported.shippingInformation,
    sourceMetadata: imported.sourceMetadata,
  };
}

function serializeOrder(
  order: Order,
  customer: Customer,
  product?: typeof supplierProductsTable.$inferSelect | null,
) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: customer.name,
    customerEmail: customer.email,
    total: toNumber(order.total),
    quantity: order.quantity,
    currency: order.currency,
    status: order.status,
    supplierProductId: order.supplierProductId,
    productTitle: product?.title ?? null,
    shippingAddress: order.shippingAddress,
    fulfillmentStatus: order.fulfillmentStatus,
    supplierPaymentStatus: order.supplierPaymentStatus,
    supplierPaymentReference: order.supplierPaymentReference,
    supplierPaymentAmountMinor: order.supplierPaymentAmountMinor,
    supplierPaidAt: order.supplierPaidAt,
    createdAt: order.createdAt,
  };
}

function serializeSupplierProduct(product: typeof supplierProductsTable.$inferSelect) {
  return {
    id: product.id,
    sourceUrl: product.sourceUrl,
    supplierUrl: product.supplierUrl,
    sourceDomain: product.sourceDomain,
    sourceProductId: product.sourceProductId,
    title: product.title,
    description: product.description,
    imageUrl: product.imageUrl,
    imageUrls: jsonArray(product.imageUrls),
    videoUrls: jsonArray(product.videoUrls),
    price: product.price === null ? null : toNumber(product.price),
    salePrice: product.salePrice === null ? null : toNumber(product.salePrice),
    currency: product.currency,
    sku: product.sku,
    variants: jsonArray(product.variants),
    attributes: jsonRecord(product.attributes),
    availability: product.availability,
    availabilityQuantity: product.availabilityQuantity,
    inventoryStrategy: product.inventoryStrategy,
    inventoryStatus: product.inventoryStatus,
    category: product.category,
    tags: jsonArray(product.tags),
    specifications: jsonRecord(product.specifications),
    brand: product.brand,
    shippingInformation: product.shippingInformation,
    taxConfiguration: product.taxConfiguration,
    shippingConfiguration: product.shippingConfiguration,
    seoConfiguration: product.seoConfiguration,
    sourceMetadata: jsonRecord(product.sourceMetadata),
    profitType: product.profitType,
    pricingMode: product.pricingMode,
    profitValue: toNumber(product.profitValue),
    sellingPrice:
      product.sellingPrice === null ? null : toNumber(product.sellingPrice),
    status: product.status,
    importStatus: product.importStatus,
    importError: product.importError,
    visibility: product.visibility,
    marketplaceVisibility: product.marketplaceVisibility,
    importedAt: product.importedAt,
    lastAttemptedSync: product.lastAttemptedSync,
    publishedAt: product.publishedAt,
  };
}

function serializeSupplier(supplier: Supplier, productCount: number) {
  return {
    id: supplier.id,
    name: supplier.name,
    website: supplier.website,
    domain: supplier.domain,
    contactEmail: supplier.contactEmail,
    contactPhone: supplier.contactPhone,
    category: supplier.category,
    notes: supplier.notes,
    productCount,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
  };
}

type ImportedProductOptions = {
  supplierUrl?: string | null;
  supplierName?: string | null;
  title?: string;
  description?: string | null;
  imageUrl?: string | null;
  imageUrls?: unknown;
  salePrice?: number | null;
  currency?: string;
  sku?: string | null;
  sourceProductId?: string | null;
  variants?: unknown;
  attributes?: unknown;
  availability?: string | null;
  availabilityQuantity?: number | null;
  category?: string | null;
  tags?: unknown;
  specifications?: unknown;
  brand?: string | null;
  shippingInformation?: unknown;
  taxConfiguration?: unknown;
  shippingConfiguration?: unknown;
  seoConfiguration?: unknown;
  costPrice?: number | null;
  profitType?: string;
  profitValue?: number;
  pricingMode?: string;
  sellingPrice?: number | null;
  visibility?: string;
  marketplaceVisibility?: boolean;
  inventoryStrategy?: string;
  inventoryStatus?: string;
  inventoryQuantity?: number | null;
  duplicateAction?: string;
};

function normalizedSupplierUrl(sourceUrl: string, supplierUrl?: string | null): {
  url: string;
  domain: string;
} {
  const url = new URL(supplierUrl || new URL(sourceUrl).origin);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Supplier link must use http or https");
  }
  return { url: url.toString(), domain: url.hostname.toLowerCase() };
}

async function ensureSupplierRecord(
  merchantId: number,
  supplierUrl: string,
  supplierName?: string | null,
): Promise<Supplier> {
  const parsed = new URL(supplierUrl);
  const domain = parsed.hostname.toLowerCase();
  const existing = (
    await db
      .select()
      .from(suppliersTable)
      .where(
        and(eq(suppliersTable.merchantId, merchantId), eq(suppliersTable.domain, domain)),
      )
      .limit(1)
  )[0];
  if (existing) return existing;
  const [created] = await db
    .insert(suppliersTable)
    .values({
      merchantId,
      name: supplierName?.trim() || domain,
      website: parsed.origin,
      domain,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [afterConflict] = await db
    .select()
    .from(suppliersTable)
    .where(
      and(eq(suppliersTable.merchantId, merchantId), eq(suppliersTable.domain, domain)),
    )
    .limit(1);
  if (!afterConflict) throw new Error("Supplier record could not be created");
  return afterConflict;
}

function importedProductValues(
  imported: ImportedSupplierProduct,
  options: ImportedProductOptions,
  supplierId: number,
) {
  const cost = options.costPrice === undefined ? imported.price : options.costPrice;
  const profitType = options.profitType ?? "fixed";
  const profitValue = options.profitValue ?? 0;
  const pricingMode =
    options.pricingMode ??
    (profitType === "percentage" ? "percentage_markup" : "fixed_markup");
  const sellingPrice = calculateSellingPrice(
    cost,
    profitType,
    profitValue,
    pricingMode,
    options.sellingPrice,
  );
  const visibility = options.visibility ?? "active";
  return {
    supplierId,
    sourceUrl: imported.sourceUrl,
    supplierUrl: normalizedSupplierUrl(imported.sourceUrl, options.supplierUrl).url,
    sourceDomain: imported.sourceDomain,
    sourceProductId: options.sourceProductId ?? imported.sourceProductId,
    title: options.title ?? imported.title,
    description: options.description === undefined ? imported.description : options.description,
    imageUrl: options.imageUrl === undefined ? imported.imageUrl : options.imageUrl,
    imageUrls: options.imageUrls ?? imported.imageUrls,
    videoUrls: imported.videoUrls,
    price: cost === null ? null : Number(cost).toFixed(2),
    salePrice:
      options.salePrice === undefined
        ? imported.salePrice
        : options.salePrice === null
          ? null
          : Number(options.salePrice).toFixed(2),
    currency: (options.currency ?? imported.currency).toUpperCase(),
    sku: options.sku === undefined ? imported.sku : options.sku,
    variants: options.variants ?? imported.variants,
    attributes: options.attributes ?? imported.attributes,
    availability: options.availability === undefined ? imported.availability : options.availability,
    availabilityQuantity:
      options.availabilityQuantity === undefined
        ? imported.availabilityQuantity
        : options.availabilityQuantity,
    inventoryStrategy: options.inventoryStrategy ?? "source_based",
    inventoryStatus:
      options.inventoryStatus ??
      (imported.availability ?? "unknown"),
    category: options.category === undefined ? imported.category : options.category,
    tags: options.tags ?? [],
    specifications: options.specifications ?? imported.specifications,
    brand: options.brand === undefined ? imported.brand : options.brand,
    shippingInformation:
      options.shippingInformation === undefined
        ? imported.shippingInformation
        : options.shippingInformation,
    taxConfiguration: options.taxConfiguration ?? null,
    shippingConfiguration: options.shippingConfiguration ?? null,
    seoConfiguration: options.seoConfiguration ?? null,
    sourceMetadata: imported.sourceMetadata,
    merchantOverrides: {
      ...(options.title !== undefined ? { title: true } : {}),
      ...(options.description !== undefined ? { description: true } : {}),
      ...(options.imageUrl !== undefined ? { imageUrl: true } : {}),
      ...(options.salePrice !== undefined ? { salePrice: true } : {}),
      ...(options.sellingPrice !== undefined ? { sellingPrice: true } : {}),
      ...(options.tags !== undefined ? { tags: true } : {}),
    },
    profitType,
    pricingMode,
    profitValue: Number(profitValue).toFixed(2),
    sellingPrice: sellingPrice === null ? null : sellingPrice.toFixed(2),
    visibility,
    marketplaceVisibility: options.marketplaceVisibility ?? false,
    status: visibility === "active" ? "active" : "draft",
    importStatus: visibility === "active" ? "imported" : "needs_review",
    importError: null,
    lastAttemptedSync: new Date(),
    publishedAt: visibility === "active" ? new Date() : null,
  };
}

function serializeDropshipQueueItem(
  order: Order,
  customer: Customer,
  product: typeof supplierProductsTable.$inferSelect,
) {
  const supplierCost = product.price === null ? null : toNumber(product.price);
  const sellingPrice =
    product.sellingPrice === null ? null : toNumber(product.sellingPrice);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    shippingAddress: order.shippingAddress,
    productTitle: product.title,
    supplierUrl: product.supplierUrl,
    sourceUrl: product.sourceUrl,
    supplierOrderReference: order.supplierOrderReference,
    trackingNumber: order.trackingNumber,
    fulfillmentNote: order.fulfillmentNote,
    fulfillmentSubmittedAt: order.fulfillmentSubmittedAt,
    fulfillmentUpdatedAt: order.fulfillmentUpdatedAt,
    supplierCost,
    profit:
      supplierCost === null || sellingPrice === null
        ? null
        : Number((sellingPrice - supplierCost).toFixed(2)),
    sellingPrice,
    total: toNumber(order.total),
    quantity: order.quantity,
    currency: order.currency,
    orderStatus: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    createdAt: order.createdAt,
  };
}

function serializePublicCheckoutOrder(
  order: Order,
  product: typeof supplierProductsTable.$inferSelect,
) {
  return {
    orderNumber: order.orderNumber,
    title: product.title,
    subtotal: toNumber(order.subtotal),
    tax: toNumber(order.taxAmount),
    shipping: toNumber(order.shippingAmount),
    total: toNumber(order.total),
    currency: order.currency,
    status: "pending" as const,
    paymentMessage:
      "Order received. Payment is not captured online; the store will confirm payment before fulfillment.",
  };
}

function serializeWithdrawal(withdrawal: Withdrawal) {
  return {
    id: withdrawal.id,
    amount: toNumber(withdrawal.amount),
    currency: withdrawal.currency,
    status: withdrawal.status,
    beneficiaryName: withdrawal.beneficiaryName,
    bankName: withdrawal.bankName,
    accountLast4: withdrawal.accountLast4,
    reviewNote: withdrawal.reviewNote,
    reviewedAt: withdrawal.reviewedAt,
    paidAt: withdrawal.paidAt,
    createdAt: withdrawal.createdAt,
  };
}

function serializeBankAccount(account: MerchantBankAccount) {
  return {
    id: account.id,
    beneficiaryName: account.beneficiaryName,
    bankName: account.bankName,
    bankCode: account.bankCode,
    accountLast4: account.accountLast4,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

async function getWithdrawalSecurity(merchantId: number) {
  return (
    await db
      .select()
      .from(withdrawalSecurityTable)
      .where(eq(withdrawalSecurityTable.merchantId, merchantId))
      .limit(1)
  )[0];
}

function pinHashes(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${digest}`;
}

function verifyPin(pin: string, encoded: string): boolean {
  const [salt, expectedHex] = encoded.split(":");
  if (!salt || !expectedHex || expectedHex.length !== 64) return false;
  const actual = scryptSync(pin, salt, 32);
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function verifyPinSet(
  pins: string[],
  stored: unknown,
  required: number,
): boolean {
  const hashes = pinHashes(stored);
  return (
    pins.length === required &&
    hashes.length === required &&
    new Set(pins).size === required &&
    pins.every((pin, index) => verifyPin(pin, hashes[index] ?? ""))
  );
}

async function requireAdminWithdrawalSecurity(
  req: Request,
  res: Response,
  identity: Identity,
  code: string,
  pinCodes: string[],
  confirmation: string,
  expectedConfirmation: string,
) {
  const auth = getAuth(req);
  if (!auth.sessionId || auth.userId !== identity.clerkUserId) {
    res.status(403).json({ error: "A valid Clerk session is required" });
    return false;
  }
  if (
    !identity.emailVerified ||
    identity.email !== ADMIN_EMAIL ||
    confirmation.trim().toUpperCase() !== expectedConfirmation.toUpperCase()
  ) {
    res.status(403).json({
      error: "Admin step-up verification and exact action confirmation are required",
    });
    return false;
  }
  const merchant = await getOrCreateMerchant(identity);
  const security = await getWithdrawalSecurity(merchant.id);
  if (!security?.totpSecretCiphertext) {
    res.status(409).json({
      error: "Enable authenticator security on the master admin account first",
    });
    return false;
  }
  let valid = false;
  try {
    valid = verifyTotp(decryptSecret(security.totpSecretCiphertext), code);
  } catch {
    valid = false;
  }
  if (!valid) {
    res.status(403).json({ error: "The authenticator code is invalid or expired" });
    return false;
  }
  if (!verifyPinSet(pinCodes, security.adminPinHashes, 5)) {
    res.status(403).json({ error: "All five admin withdrawal PINs are required and must be correct" });
    return false;
  }
  return true;
}

async function payFromEarnings(merchant: Merchant) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from ${subscriptionsTable} where ${subscriptionsTable.merchantId} = ${merchant.id} for update`,
    );
    const subscription = (
      await tx
        .select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.merchantId, merchant.id))
        .limit(1)
    )[0];
    if (!subscription) throw new Error("Subscription not found");
    const reference = `EARN-SUB-${subscription.id}`;
    const priorPayment = (
      await tx
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.reference, reference))
        .limit(1)
    )[0];
    if (priorPayment) {
      const settled =
        toNumber(subscription.amountPaid) >= toNumber(subscription.amountDue);
      if (
        priorPayment.merchantId !== merchant.id ||
        priorPayment.method !== "earnings" ||
        priorPayment.status !== "confirmed" ||
        !settled
      ) {
        throw new Error(
          "The internal earnings payment key is unavailable; no funds were applied",
        );
      }
      return { payment: priorPayment, subscription };
    }

    const remaining = Math.max(
      0,
      toNumber(subscription.amountDue) - toNumber(subscription.amountPaid),
    );
    if (remaining === 0) {
      throw new Error("Subscription is already settled");
    }
    const [pendingBankTransfers] = await tx
      .select({
        total: sql<string>`coalesce(sum(${paymentsTable.amount}) filter (where ${paymentsTable.method} = 'bank_transfer' and ${paymentsTable.status} = 'under_review'), 0)`,
      })
      .from(paymentsTable)
      .where(eq(paymentsTable.merchantId, merchant.id));
    if (toNumber(pendingBankTransfers?.total) > 0) {
      throw new Error(
        "A bank transfer is awaiting review; wait for that decision before paying from earnings",
      );
    }
    if (toNumber(subscription.earningsHeld) < remaining) {
      throw new Error("Not enough held earnings to pay the subscription");
    }

    const [updatedSubscription] = await tx
      .update(subscriptionsTable)
      .set({
        amountPaid: (toNumber(subscription.amountPaid) + remaining).toFixed(2),
        earningsHeld: (
          toNumber(subscription.earningsHeld) - remaining
        ).toFixed(2),
        paymentMethod: "earnings",
        status: "active",
      })
      .where(
        and(
          eq(subscriptionsTable.id, subscription.id),
          eq(subscriptionsTable.amountPaid, subscription.amountPaid),
          eq(subscriptionsTable.earningsHeld, subscription.earningsHeld),
        ),
      )
      .returning();
    if (!updatedSubscription) {
      throw new Error("Subscription changed while payment was processing");
    }

    const [payment] = await tx
      .insert(paymentsTable)
      .values({
        merchantId: merchant.id,
        amount: remaining.toFixed(2),
        currency: merchant.currency,
        method: "earnings",
        reference,
        status: "confirmed",
        reviewedAt: new Date(),
      })
      .returning();
    if (merchant.status !== "banned") {
      await tx
        .update(merchantsTable)
        .set({ status: "active" })
        .where(eq(merchantsTable.id, merchant.id));
    }
    await tx.insert(activityTable).values({
      merchantId: merchant.id,
      type: "subscription_payment",
      title: "Platform fee paid from earnings",
      description: "Held earnings were applied to your platform fee.",
      amount: remaining.toFixed(2),
      currency: merchant.currency,
      tone: "negative",
    });
    return { payment, subscription: updatedSubscription };
  });
}

router.get("/settings/currency", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  res.json(
    GetCurrencySettingsResponse.parse({
      currency: merchant.currency,
      availableCurrencies: [...SUPPORTED_CURRENCIES],
    }),
  );
});

router.put("/settings/currency", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = UpdateCurrencySettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a valid three-letter currency code" });
    return;
  }
  const currency = parsed.data.currency.trim().toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(currency as (typeof SUPPORTED_CURRENCIES)[number])) {
    res.status(400).json({
      error: `Supported currencies: ${SUPPORTED_CURRENCIES.join(", ")}`,
    });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const [updated] = await db
    .update(merchantsTable)
    .set({ currency })
    .where(eq(merchantsTable.id, merchant.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Merchant account not found" });
    return;
  }
  res.json(
    UpdateCurrencySettingsResponse.parse({
      currency: updated.currency,
      availableCurrencies: [...SUPPORTED_CURRENCIES],
    }),
  );
});

router.get("/settings/checkout", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  res.json(GetCheckoutSettingsResponse.parse({
    taxRate: toNumber(merchant.taxRate),
    shippingFee: toNumber(merchant.shippingFee),
    freeShippingThreshold: merchant.freeShippingThreshold === null ? null : toNumber(merchant.freeShippingThreshold),
    currency: merchant.currency,
  }));
});

router.put("/settings/checkout", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = UpdateCheckoutSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a tax rate from 0 to 100, a non-negative shipping fee, and a valid free-shipping threshold." });
    return;
  }
  const [updated] = await db.update(merchantsTable).set({
    taxRate: parsed.data.taxRate.toFixed(2),
    shippingFee: parsed.data.shippingFee.toFixed(2),
    freeShippingThreshold: parsed.data.freeShippingThreshold === null ? null : parsed.data.freeShippingThreshold.toFixed(2),
  }).where(eq(merchantsTable.id, (await getOrCreateMerchant(identity)).id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Merchant account not found" });
    return;
  }
  await addActivity(updated.id, {
    type: "checkout_settings_updated",
    title: "Checkout pricing rules updated",
    description: `Tax ${toNumber(updated.taxRate).toFixed(2)}%; shipping ${toNumber(updated.shippingFee).toFixed(2)} ${updated.currency}.`,
    tone: "neutral",
  });
  res.json(UpdateCheckoutSettingsResponse.parse({
    taxRate: toNumber(updated.taxRate),
    shippingFee: toNumber(updated.shippingFee),
    freeShippingThreshold: updated.freeShippingThreshold === null ? null : toNumber(updated.freeShippingThreshold),
    currency: updated.currency,
  }));
});

router.get("/settings/fx", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const base = String(req.query.base ?? merchant.currency).trim().toUpperCase();
  const quote = String(req.query.quote ?? merchant.currency).trim().toUpperCase();
  if (!isSupportedCurrency(base) || !isSupportedCurrency(quote)) {
    res.status(400).json({
      error: `Supported currencies: ${SUPPORTED_CURRENCIES.join(", ")}`,
    });
    return;
  }
  if (base === quote) {
    res.json(
      GetMarketExchangeRateResponse.parse({
        base,
        quote,
        rate: 1,
        source: "Identity rate",
        fetchedAt: new Date().toISOString(),
        asOf: new Date().toISOString(),
      }),
    );
    return;
  }
  const cacheKey = `${base}:${quote}`;
  const cached = fxCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(GetMarketExchangeRateResponse.parse(cached.payload));
    return;
  }
  try {
    const response = await fetch(
      `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!response.ok) throw new Error(`FX provider returned ${response.status}`);
    const body = (await response.json()) as {
      rates?: Record<string, number>;
      time_last_update_utc?: string;
    };
    const rate = Number(body.rates?.[quote]);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error("The selected currency pair is not available");
    }
    const fetchedAt = new Date().toISOString();
    const asOfDate = body.time_last_update_utc
      ? new Date(body.time_last_update_utc)
      : null;
    const payload = {
      base,
      quote,
      rate,
      source: "ExchangeRate-API Open Access",
      fetchedAt,
      asOf:
        asOfDate && !Number.isNaN(asOfDate.getTime())
          ? asOfDate.toISOString()
          : null,
    };
    fxCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60 * 1000, payload });
    res.json(GetMarketExchangeRateResponse.parse(payload));
  } catch (error) {
    req.log.warn({ err: error, base, quote }, "Could not retrieve market FX rate");
    res.status(502).json({
      error: "The market rate is temporarily unavailable. Historical money is unchanged.",
    });
  }
});

router.post("/store", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = CreateStoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Store name must be between 2 and 80 characters" });
    return;
  }
  const storeName = parsed.data.storeName.trim().replace(/\s+/g, " ");
  if (storeName.length < 2 || storeName.length > 80) {
    res.status(400).json({ error: "Store name must be between 2 and 80 characters" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const [updated] = await db
    .update(merchantsTable)
    .set({ storeName })
    .where(eq(merchantsTable.id, merchant.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Merchant account not found" });
    return;
  }
  await addActivity(updated.id, {
    type: "store_updated",
    title: "Store profile saved",
    description: `Store name updated to ${updated.storeName}.`,
    tone: "positive",
  });
  res.status(201).json(
    CreateStoreResponse.parse({
      id: updated.id,
      name: updated.name,
      storeName: updated.storeName,
      storeSlug: storeSlug(updated.storeName),
      merchantKey: updated.clerkUserId ?? identity.clerkUserId,
      createdAt: updated.registeredAt,
    }),
  );
});

router.get("/dashboard/overview", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const enforced = await enforceSubscription(merchant, identity.isAdmin);
  const subscription = serializeSubscription(
    enforced.merchant,
    enforced.subscription,
    identity.isAdmin,
  );
  const paidStatuses = ["paid", "fulfilled"];
  const now = new Date();
  const currentPeriodStart = new Date(now.getTime() - 7 * 86400000);
  const previousPeriodStart = new Date(now.getTime() - 14 * 86400000);
  const [metrics] = await db
    .select({
      revenue: sql<string>`coalesce(sum(${ordersTable.total}) filter (where ${inArray(ordersTable.status, paidStatuses)}), 0)`,
      orders: sql<string>`count(*) filter (where ${ordersTable.status} <> 'cancelled')`,
      customers: sql<string>`count(distinct ${ordersTable.customerId})`,
      pendingBalance: sql<string>`coalesce(sum(${ordersTable.total}) filter (where ${ordersTable.status} = 'pending'), 0)`,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.merchantId, enforced.merchant.id),
        eq(ordersTable.currency, enforced.merchant.currency),
      ),
    );
  const [currentPeriod] = await db
    .select({
      total: sql<string>`coalesce(sum(${ordersTable.total}), 0)`,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.merchantId, enforced.merchant.id),
        eq(ordersTable.currency, enforced.merchant.currency),
        inArray(ordersTable.status, paidStatuses),
        gte(ordersTable.createdAt, currentPeriodStart),
      ),
    );
  const [previousPeriod] = await db
    .select({
      total: sql<string>`coalesce(sum(${ordersTable.total}), 0)`,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.merchantId, enforced.merchant.id),
        eq(ordersTable.currency, enforced.merchant.currency),
        inArray(ordersTable.status, paidStatuses),
        gte(ordersTable.createdAt, previousPeriodStart),
        lt(ordersTable.createdAt, currentPeriodStart),
      ),
    );
  const [withdrawalReserve] = await db
    .select({
      total: sql<string>`coalesce(sum(${withdrawalsTable.amount}) filter (where ${withdrawalsTable.status} in ('pending', 'approved', 'paid')), 0)`,
    })
    .from(withdrawalsTable)
    .where(
      and(
        eq(withdrawalsTable.merchantId, enforced.merchant.id),
        eq(withdrawalsTable.currency, enforced.merchant.currency),
      ),
    );
  const seriesStart = new Date(now);
  seriesStart.setHours(0, 0, 0, 0);
  seriesStart.setDate(seriesStart.getDate() - 6);
  const recentSales = await db
    .select({ total: ordersTable.total, createdAt: ordersTable.createdAt })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.merchantId, enforced.merchant.id),
        inArray(ordersTable.status, paidStatuses),
        gte(ordersTable.createdAt, seriesStart),
      ),
    );
  const seriesAmounts = new Map<string, number>();
  for (const sale of recentSales) {
    const key = sale.createdAt.toISOString().slice(0, 10);
    seriesAmounts.set(key, (seriesAmounts.get(key) ?? 0) + toNumber(sale.total));
  }
  const revenueSeries = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(seriesStart);
    day.setDate(seriesStart.getDate() + index);
    return {
      label: day.toLocaleDateString("en-US", { weekday: "short" }),
      amount: seriesAmounts.get(day.toISOString().slice(0, 10)) ?? 0,
    };
  });
  const revenue = toNumber(metrics?.revenue);
  const currentRevenue = toNumber(currentPeriod?.total);
  const previousRevenue = toNumber(previousPeriod?.total);
  const revenueChange =
    previousRevenue === 0
      ? currentRevenue > 0
        ? 100
        : 0
      : Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 100);
  const availableBalance = Math.max(
    0,
    revenue -
      subscription.earningsHeld -
      toNumber(withdrawalReserve?.total),
  );
  res.json(
    GetDashboardOverviewResponse.parse({
      storeName: enforced.merchant.storeName,
      currency: enforced.merchant.currency,
      storeSlug: storeSlug(enforced.merchant.storeName),
      revenue,
      revenueChange,
      orders: Number(metrics?.orders ?? 0),
      customers: Number(metrics?.customers ?? 0),
      availableBalance,
      pendingBalance: toNumber(metrics?.pendingBalance),
      withdrawalReserved: toNumber(withdrawalReserve?.total),
      earningsHeldForSubscription: subscription.earningsHeld,
      subscription,
      revenueSeries,
    }),
  );
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const activity = await db
    .select()
    .from(activityTable)
    .where(eq(activityTable.merchantId, merchant.id))
    .orderBy(desc(activityTable.occurredAt))
    .limit(10);
  res.json(
    ListDashboardActivityResponse.parse(
      activity.map((item) => ({
        ...item,
        amount: item.amount === null ? null : toNumber(item.amount),
      })),
    ),
  );
});

router.get("/ai/overview", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  try {
    const merchant = await getOrCreateMerchant(identity);
    const overview = await getAiOverviewForMerchant({
      id: merchant.id,
      currency: merchant.currency,
      storeName: merchant.storeName,
    });
    res.json(GetAiOverviewResponse.parse(overview));
  } catch (error) {
    req.log.error({ err: error }, "Could not load AI overview");
    res.status(500).json({ error: "AI overview could not be loaded" });
  }
});

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

router.post("/ai/research", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = ResearchWebBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Research query must be between 3 and 180 characters" });
    return;
  }
  const query = parsed.data.query.trim();
  try {
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: { "user-agent": "TS-Commerce-Research/1.0" }, signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) throw new Error(`Search provider returned ${response.status}`);
    const html = await response.text();
    const sources: Array<{ title: string; url: string; snippet: string }> = [];
    const resultPattern =
      /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>)/g;
    for (const match of html.matchAll(resultPattern)) {
      const rawUrl = decodeHtml(match[1] ?? "");
      const title = decodeHtml(match[2] ?? "");
      const snippet = decodeHtml(match[3] ?? match[4] ?? "");
      if (!rawUrl || !title) continue;
      const url = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
      if (!/^https?:\/\//i.test(url)) continue;
      sources.push({ title, url, snippet });
      if (sources.length >= 6) break;
    }
    const summary =
      sources.length > 0
        ? `I found ${sources.length} public sources for “${query}”. Review the snippets and open the cited sources before making a commercial decision.`
        : `No public search results were returned for “${query}”. Try a more specific query.`;
    const searchedAt = new Date().toISOString();
    res.json(
      ResearchWebResponse.parse({
        query,
        summary,
        searchedAt,
        source: "DuckDuckGo HTML search",
        limitations: [
          "This is a read-only search pass, not a guarantee that every relevant page was found.",
          "Search snippets can be incomplete or stale; verify claims at the cited source.",
          "No private merchant data was sent to the search provider.",
        ],
        sources,
      }),
    );
  } catch (error) {
    req.log.warn({ err: error }, "Web research failed");
    res.status(502).json({
      error: "Web research is temporarily unavailable. Your merchant data was not changed.",
    });
  }
});

router.post("/ai/train", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  try {
    const merchant = await getOrCreateMerchant(identity);
    const settings = await getAiSettingsForMerchant(merchant.id);
    if (!settings.trainingOptIn) {
      res.status(403).json({ error: "Enable local AI training before training a model" });
      return;
    }
    const model = await trainMerchantAiModel({
      id: merchant.id,
      currency: merchant.currency,
      storeName: merchant.storeName,
    });
    await addActivity(merchant.id, {
      type: "ai_model_trained",
      title: "Local AI model evaluated",
      description:
        model.status === "trained"
          ? `Commerce signals model trained on ${model.trainingExamples} persisted examples.`
          : `Training needs more persisted commerce data (${model.trainingExamples} examples available).`,
      tone: model.status === "trained" ? "positive" : "warning",
    });
    res.status(201).json(TrainAiModelResponse.parse(model));
  } catch (error) {
    req.log.error({ err: error }, "Could not train AI model");
    res.status(500).json({ error: "AI model training could not be completed" });
  }
});

router.get("/ai/settings", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  try {
    const merchant = await getOrCreateMerchant(identity);
    res.json(GetAiSettingsResponse.parse(await getAiSettingsForMerchant(merchant.id)));
  } catch (error) {
    req.log.error({ err: error }, "Could not load AI settings");
    res.status(500).json({ error: "AI settings could not be loaded" });
  }
});

router.put("/ai/settings", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = UpdateAiSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "AI settings are invalid" });
    return;
  }
  if (parsed.data.runMyBusiness && parsed.data.autonomyLevel !== 4) {
    res.status(400).json({
      error: "RUN MY BUSINESS requires autonomy level 4 and keeps approval safeguards enabled",
    });
    return;
  }
  if (parsed.data.runMyBusiness && !parsed.data.trainingOptIn) {
    res.status(400).json({
      error: "RUN MY BUSINESS requires local training consent",
    });
    return;
  }
  try {
    const merchant = await getOrCreateMerchant(identity);
    const updated = await db.transaction(async (tx) => {
      await tx
        .insert(aiSettingsTable)
        .values({ merchantId: merchant.id })
        .onConflictDoNothing({ target: aiSettingsTable.merchantId });
      await tx.execute(
        sql`select id from ${aiSettingsTable} where ${aiSettingsTable.merchantId} = ${merchant.id} for update`,
      );
      const [settings] = await tx
        .select()
        .from(aiSettingsTable)
        .where(eq(aiSettingsTable.merchantId, merchant.id))
        .limit(1);
      if (!settings) throw new Error("AI settings could not be initialized");
      const [saved] = await tx
        .update(aiSettingsTable)
        .set({
          autonomyLevel: parsed.data.autonomyLevel,
          runMyBusiness: parsed.data.runMyBusiness,
          trainingOptIn: parsed.data.trainingOptIn,
          updatedAt: new Date(),
        })
        .where(eq(aiSettingsTable.id, settings.id))
        .returning();
      if (!saved) throw new Error("AI settings could not be saved");
      await tx.insert(activityTable).values({
        merchantId: merchant.id,
        type: "ai_settings_updated",
        title: "AI operating settings updated",
        description: `Autonomy level ${saved.autonomyLevel}; RUN MY BUSINESS ${saved.runMyBusiness ? "enabled with approvals" : "disabled"}.`,
        tone: "neutral",
      });
      return saved;
    });
    res.json(
      UpdateAiSettingsResponse.parse({
        autonomyLevel: updated.autonomyLevel,
        runMyBusiness: updated.runMyBusiness,
        trainingOptIn: updated.trainingOptIn,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Could not update AI settings");
    res.status(500).json({ error: "AI settings could not be saved" });
  }
});

router.get("/ai/actions", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  try {
    const merchant = await getOrCreateMerchant(identity);
    res.json(ListAiActionsResponse.parse(await listAiActionsForMerchant(merchant.id)));
  } catch (error) {
    req.log.error({ err: error }, "Could not list AI actions");
    res.status(500).json({ error: "AI action history could not be loaded" });
  }
});

router.post("/ai/actions", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = CreateAiActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "AI action details are invalid" });
    return;
  }
  if (!(await allowedActionType(parsed.data.actionType))) {
    res.status(400).json({
      error: "This action is outside the safe local preparation boundary",
    });
    return;
  }
  try {
    const merchant = await getOrCreateMerchant(identity);
    const [action] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(aiActionsTable)
        .values({
          merchantId: merchant.id,
          agent: parsed.data.agent.trim(),
          actionType: parsed.data.actionType.trim(),
          title: parsed.data.title.trim(),
          reason: parsed.data.reason.trim(),
          risk: parsed.data.risk,
          reversible: parsed.data.reversible,
          approvalRequired: true,
          rollbackAvailable: parsed.data.reversible,
          status: "awaiting_approval",
          dataUsed: {
            source: "local_commerce_signals",
            merchantId: merchant.id,
            capturedAt: new Date().toISOString(),
          },
        })
        .returning();
      if (!created) throw new Error("AI action could not be created");
      await tx.insert(activityTable).values({
        merchantId: merchant.id,
        type: "ai_action_created",
        title: "AI action sent for approval",
        description: created.title,
        tone: "neutral",
      });
      return [created];
    });
    res.status(201).json(CreateAiActionResponse.parse(serializeAiAction(action)));
  } catch (error) {
    req.log.error({ err: error }, "Could not create AI action");
    res.status(500).json({ error: "AI action could not be created" });
  }
});

router.patch("/ai/actions/:id/approve", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const params = ApproveAiActionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "AI action id is invalid" });
    return;
  }
  try {
    const merchant = await getOrCreateMerchant(identity);
    const action = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from ${aiActionsTable} where ${aiActionsTable.id} = ${params.data.id} and ${aiActionsTable.merchantId} = ${merchant.id} for update`,
      );
      const [current] = await tx
        .select()
        .from(aiActionsTable)
        .where(and(eq(aiActionsTable.id, params.data.id), eq(aiActionsTable.merchantId, merchant.id)))
        .limit(1);
      if (!current) throw new Error("AI action not found");
      if (current.status !== "awaiting_approval") {
        throw new Error("Only awaiting actions can be approved");
      }
      const [updated] = await tx
        .update(aiActionsTable)
        .set({ status: "approved", approvedAt: new Date() })
        .where(eq(aiActionsTable.id, current.id))
        .returning();
      if (!updated) throw new Error("AI action could not be approved");
      await tx.insert(activityTable).values({
        merchantId: merchant.id,
        type: "ai_action_approved",
        title: "AI action approved",
        description: updated.title,
        tone: "positive",
      });
      return updated;
    });
    res.json(ApproveAiActionResponse.parse(serializeAiAction(action)));
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "AI action approval failed" });
  }
});

router.patch("/ai/actions/:id/reject", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const params = RejectAiActionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "AI action id is invalid" });
    return;
  }
  try {
    const merchant = await getOrCreateMerchant(identity);
    const action = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from ${aiActionsTable} where ${aiActionsTable.id} = ${params.data.id} and ${aiActionsTable.merchantId} = ${merchant.id} for update`,
      );
      const [current] = await tx
        .select()
        .from(aiActionsTable)
        .where(and(eq(aiActionsTable.id, params.data.id), eq(aiActionsTable.merchantId, merchant.id)))
        .limit(1);
      if (!current) throw new Error("AI action not found");
      if (current.status !== "awaiting_approval") {
        throw new Error("Only awaiting actions can be rejected");
      }
      const [updated] = await tx
        .update(aiActionsTable)
        .set({ status: "rejected", rollbackAvailable: false })
        .where(eq(aiActionsTable.id, current.id))
        .returning();
      if (!updated) throw new Error("AI action could not be rejected");
      await tx.insert(activityTable).values({
        merchantId: merchant.id,
        type: "ai_action_rejected",
        title: "AI action rejected",
        description: updated.title,
        tone: "neutral",
      });
      return updated;
    });
    res.json(RejectAiActionResponse.parse(serializeAiAction(action)));
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "AI action rejection failed" });
  }
});

router.post("/ai/actions/:id/execute", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const params = ExecuteAiActionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "AI action id is invalid" });
    return;
  }
  try {
    const merchant = await getOrCreateMerchant(identity);
    const action = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from ${aiActionsTable} where ${aiActionsTable.id} = ${params.data.id} and ${aiActionsTable.merchantId} = ${merchant.id} for update`,
      );
      const [current] = await tx
        .select()
        .from(aiActionsTable)
        .where(and(eq(aiActionsTable.id, params.data.id), eq(aiActionsTable.merchantId, merchant.id)))
        .limit(1);
      if (!current) throw new Error("AI action not found");
      if (current.status !== "approved") {
        throw new Error("Approve the action before executing it");
      }
      if (!current.reversible || !(await allowedActionType(current.actionType))) {
        throw new Error("Only reversible local preparation actions can execute");
      }
      let result: Record<string, unknown> = {
        outcome: "prepared",
        sideEffect: "none",
        message:
          "The action produced a review boundary only. No money, permissions, ledger, customer data, or external service was changed.",
      };
      if (current.actionType === "ad_draft") {
        const products = await tx
          .select({
            title: supplierProductsTable.title,
            description: supplierProductsTable.description,
            sellingPrice: supplierProductsTable.sellingPrice,
            currency: supplierProductsTable.currency,
          })
          .from(supplierProductsTable)
          .where(eq(supplierProductsTable.merchantId, merchant.id))
          .orderBy(desc(supplierProductsTable.updatedAt))
          .limit(3);
        result = {
          outcome: "ad_draft_prepared",
          sideEffect: "none",
          message: "Drafts are ready for merchant review. Nothing was published or sent.",
          variants: products.map((product) => {
            const title = product.title.trim();
            const description = (product.description ?? "A product selected from your catalog.").trim();
            return {
              product: title,
              headline: `${title} — made for the next step`,
              primaryText: `${description.slice(0, 180)} Discover ${title} and make it part of your everyday.`,
              callToAction: "Shop now",
              currency: product.currency,
              price: product.sellingPrice ? Number(product.sellingPrice) : null,
            };
          }),
          evidence: {
            productsConsidered: products.length,
            merchantId: merchant.id,
            generatedAt: new Date().toISOString(),
          },
        };
      }
      const [updated] = await tx
        .update(aiActionsTable)
        .set({
          status: "executed",
          executedAt: new Date(),
          result,
        })
        .where(eq(aiActionsTable.id, current.id))
        .returning();
      if (!updated) throw new Error("AI action could not be executed");
      await tx.insert(activityTable).values({
        merchantId: merchant.id,
        type: "ai_action_executed",
        title: "AI action prepared safely",
        description: updated.title,
        tone: "positive",
      });
      return updated;
    });
    res.json(ExecuteAiActionResponse.parse(serializeAiAction(action)));
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "AI action execution failed" });
  }
});

router.post("/ai/actions/:id/rollback", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const params = RollbackAiActionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "AI action id is invalid" });
    return;
  }
  try {
    const merchant = await getOrCreateMerchant(identity);
    const action = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from ${aiActionsTable} where ${aiActionsTable.id} = ${params.data.id} and ${aiActionsTable.merchantId} = ${merchant.id} for update`,
      );
      const [current] = await tx
        .select()
        .from(aiActionsTable)
        .where(and(eq(aiActionsTable.id, params.data.id), eq(aiActionsTable.merchantId, merchant.id)))
        .limit(1);
      if (!current) throw new Error("AI action not found");
      if (current.status !== "executed" || !current.rollbackAvailable) {
        throw new Error("Only executed reversible actions can be rolled back");
      }
      const [updated] = await tx
        .update(aiActionsTable)
        .set({
          status: "rolled_back",
          rolledBackAt: new Date(),
          rollbackAvailable: false,
          result: {
            outcome: "rolled_back",
            compensatingRecord: true,
            message:
              "The local preparation result was invalidated. No external side effect required compensation.",
          },
        })
        .where(eq(aiActionsTable.id, current.id))
        .returning();
      if (!updated) throw new Error("AI action could not be rolled back");
      await tx.insert(activityTable).values({
        merchantId: merchant.id,
        type: "ai_action_rolled_back",
        title: "AI action rolled back",
        description: updated.title,
        tone: "neutral",
      });
      return updated;
    });
    res.json(RollbackAiActionResponse.parse(serializeAiAction(action)));
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "AI action rollback failed" });
  }
});

router.get("/bank-account", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const account = (
    await db
      .select()
      .from(merchantBankAccountsTable)
      .where(eq(merchantBankAccountsTable.merchantId, merchant.id))
      .limit(1)
  )[0];
  res.json(account ? GetLinkedBankAccountResponse.parse(serializeBankAccount(account)) : null);
});

router.put("/bank-account", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = SaveLinkedBankAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Beneficiary, bank, bank code, and account number are required" });
    return;
  }
  const accountNumber = parsed.data.accountNumber.replace(/[\s-]+/g, "");
  if (!/^[A-Za-z0-9]{4,40}$/.test(accountNumber)) {
    res.status(400).json({ error: "Enter a valid account number" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const [account] = await db
    .insert(merchantBankAccountsTable)
    .values({
      merchantId: merchant.id,
      beneficiaryName: parsed.data.beneficiaryName.trim(),
      bankName: parsed.data.bankName.trim(),
      bankCode: parsed.data.bankCode.trim(),
      accountNumberCiphertext: encryptSecret(accountNumber),
      accountLast4: accountNumber.slice(-4),
    })
    .onConflictDoUpdate({
      target: merchantBankAccountsTable.merchantId,
      set: {
        beneficiaryName: parsed.data.beneficiaryName.trim(),
        bankName: parsed.data.bankName.trim(),
        bankCode: parsed.data.bankCode.trim(),
        accountNumberCiphertext: encryptSecret(accountNumber),
        accountLast4: accountNumber.slice(-4),
        updatedAt: new Date(),
      },
    })
    .returning();
  res.json(SaveLinkedBankAccountResponse.parse(serializeBankAccount(account)));
});

router.delete("/bank-account", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  await db
    .delete(merchantBankAccountsTable)
    .where(eq(merchantBankAccountsTable.merchantId, merchant.id));
  res.status(204).send();
});

router.get("/security/withdrawal", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const security = await getWithdrawalSecurity(merchant.id);
  res.json(
    GetWithdrawalSecurityResponse.parse({
      enabled: Boolean(security?.totpSecretCiphertext),
      pendingSetup: Boolean(
        security?.pendingTotpSecretCiphertext &&
          security.pendingTotpExpiresAt &&
          security.pendingTotpExpiresAt > new Date(),
      ),
      merchantPinsConfigured: pinHashes(security?.merchantPinHashes).length,
      adminPinsConfigured: pinHashes(security?.adminPinHashes).length,
      requiredPins: identity.isAdmin ? 5 : 2,
    }),
  );
});

router.post("/security/withdrawal/setup", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  if (!identity.emailVerified) {
    res.status(403).json({ error: "Verify your primary email before enabling withdrawal security" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const current = await getWithdrawalSecurity(merchant.id);
  if (current?.totpSecretCiphertext) {
    res.status(409).json({ error: "Withdrawal authenticator security is already enabled" });
    return;
  }
  const secret = generateTotpSecret();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  if (current) {
    await db
      .update(withdrawalSecurityTable)
      .set({
        pendingTotpSecretCiphertext: encryptSecret(secret),
        pendingTotpExpiresAt: expiresAt,
      })
      .where(eq(withdrawalSecurityTable.id, current.id));
  } else {
    await db.insert(withdrawalSecurityTable).values({
      merchantId: merchant.id,
      pendingTotpSecretCiphertext: encryptSecret(secret),
      pendingTotpExpiresAt: expiresAt,
    });
  }
  res.status(201).json(
    BeginWithdrawalSecuritySetupResponse.parse({
      secret,
      otpAuthUri: createTotpUri(secret, identity.email),
      expiresAt,
    }),
  );
});

router.post("/security/withdrawal/confirm", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = ConfirmWithdrawalSecuritySetupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter the six-digit authenticator code" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const security = await getWithdrawalSecurity(merchant.id);
  if (!security?.pendingTotpSecretCiphertext || !security.pendingTotpExpiresAt) {
    res.status(409).json({ error: "Start authenticator setup first" });
    return;
  }
  if (security.pendingTotpExpiresAt < new Date()) {
    res.status(409).json({ error: "The setup code expired. Start setup again" });
    return;
  }
  let valid = false;
  try {
    valid = verifyTotp(decryptSecret(security.pendingTotpSecretCiphertext), parsed.data.code);
  } catch {
    valid = false;
  }
  if (!valid) {
    res.status(403).json({ error: "The authenticator code is invalid or expired" });
    return;
  }
  await db
    .update(withdrawalSecurityTable)
    .set({
      totpSecretCiphertext: security.pendingTotpSecretCiphertext,
      pendingTotpSecretCiphertext: null,
      pendingTotpExpiresAt: null,
      enabledAt: new Date(),
    })
    .where(eq(withdrawalSecurityTable.id, security.id));
  res.json(ConfirmWithdrawalSecuritySetupResponse.parse({ enabled: true, pendingSetup: false }));
});

router.post("/security/withdrawal/pins", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  if (!identity.emailVerified) {
    res.status(403).json({ error: "Verify your primary email before configuring withdrawal PINs" });
    return;
  }
  const parsed = SetWithdrawalPinsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter the required number of unique six-digit PINs" });
    return;
  }
  const required = identity.isAdmin ? 5 : 2;
  if (parsed.data.pins.length !== required || new Set(parsed.data.pins).size !== required) {
    res.status(400).json({ error: `Configure exactly ${required} unique withdrawal PINs` });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const current = await getWithdrawalSecurity(merchant.id);
  const hashes = parsed.data.pins.map(hashPin);
  const update = identity.isAdmin
    ? { adminPinHashes: hashes }
    : { merchantPinHashes: hashes };
  if (current) {
    await db.update(withdrawalSecurityTable).set(update).where(eq(withdrawalSecurityTable.id, current.id));
  } else {
    await db.insert(withdrawalSecurityTable).values({
      merchantId: merchant.id,
      merchantPinHashes: identity.isAdmin ? [] : hashes,
      adminPinHashes: identity.isAdmin ? hashes : [],
    });
  }
  const saved = await getWithdrawalSecurity(merchant.id);
  res.json(SetWithdrawalPinsResponse.parse({
    enabled: Boolean(saved?.totpSecretCiphertext),
    pendingSetup: Boolean(saved?.pendingTotpSecretCiphertext && saved.pendingTotpExpiresAt && saved.pendingTotpExpiresAt > new Date()),
    merchantPinsConfigured: pinHashes(saved?.merchantPinHashes).length,
    adminPinsConfigured: pinHashes(saved?.adminPinHashes).length,
    requiredPins: required,
  }));
});

router.get("/withdrawals", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const withdrawals = await db
    .select()
    .from(withdrawalsTable)
    .where(eq(withdrawalsTable.merchantId, merchant.id))
    .orderBy(desc(withdrawalsTable.createdAt))
    .limit(100);
  res.json(ListWithdrawalsResponse.parse(withdrawals.map(serializeWithdrawal)));
});

router.post("/withdrawals", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = CreateWithdrawalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Amount and a six-digit authenticator code are required" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  if (merchant.status === "banned") {
    res.status(403).json({ error: "Banned accounts cannot request withdrawals" });
    return;
  }
  const linkedBankAccount = (
    await db
      .select()
      .from(merchantBankAccountsTable)
      .where(eq(merchantBankAccountsTable.merchantId, merchant.id))
      .limit(1)
  )[0];
  if (!linkedBankAccount) {
    res.status(409).json({ error: "Link a bank account before requesting a withdrawal" });
    return;
  }
  const security = await getWithdrawalSecurity(merchant.id);
  if (!security?.totpSecretCiphertext) {
    res.status(409).json({ error: "Enable withdrawal authenticator security before requesting a payout" });
    return;
  }
  let validCode = false;
  try {
    validCode = verifyTotp(decryptSecret(security.totpSecretCiphertext), parsed.data.totpCode);
  } catch {
    validCode = false;
  }
  if (!validCode) {
    res.status(403).json({ error: "The authenticator code is invalid or expired" });
    return;
  }
  const requiredPins = identity.isAdmin ? 5 : 2;
  const configuredPins = identity.isAdmin
    ? security.adminPinHashes
    : security.merchantPinHashes;
  if (!verifyPinSet(parsed.data.pinCodes, configuredPins, requiredPins)) {
    res.status(403).json({ error: `All ${requiredPins} withdrawal PINs are required and must be correct` });
    return;
  }

  const amount = Number(parsed.data.amount.toFixed(2));
  const currency = (parsed.data.currency ?? merchant.currency).toUpperCase();
  if (currency !== merchant.currency) {
    res.status(400).json({
      error: `Withdrawal currency must match your dashboard currency (${merchant.currency})`,
    });
    return;
  }
  if (
    identity.isAdmin &&
    parsed.data.confirmation?.trim().toUpperCase() !==
      `REQUEST WITHDRAWAL ${amount.toFixed(2)} ${currency}`
  ) {
    res.status(403).json({
      error: `Type REQUEST WITHDRAWAL ${amount.toFixed(2)} ${currency} to confirm this admin payout`,
    });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from ${merchantsTable} where ${merchantsTable.id} = ${merchant.id} for update`,
      );
      await tx.execute(
        sql`select id from ${merchantBankAccountsTable} where ${merchantBankAccountsTable.merchantId} = ${merchant.id} for update`,
      );
      const currentBankAccount = (
        await tx
          .select()
          .from(merchantBankAccountsTable)
          .where(eq(merchantBankAccountsTable.merchantId, merchant.id))
          .limit(1)
      )[0];
      if (!currentBankAccount) {
        throw new Error("Link a bank account before requesting a withdrawal");
      }
      const idempotencyKey = parsed.data.idempotencyKey?.trim() || null;
      if (idempotencyKey) {
        const existing = (
          await tx
            .select()
            .from(withdrawalsTable)
            .where(
              and(
                eq(withdrawalsTable.merchantId, merchant.id),
                eq(withdrawalsTable.idempotencyKey, idempotencyKey),
              ),
            )
            .limit(1)
        )[0];
        if (existing) return existing;
      }
      // Compatibility boundary: legacy paid orders have no authoritative
      // ledger entry. Refuse withdrawals rather than treating order status as
      // settled revenue until those orders are verified through /payments.
      if (!identity.isAdmin) {
        const [unaccounted] = await tx.select({ count: sql<string>`count(*)` })
          .from(ordersTable)
          .leftJoin(ledgerEntriesTable, and(eq(ledgerEntriesTable.orderId, ordersTable.id), eq(ledgerEntriesTable.entryType, "sale")))
          .where(and(eq(ordersTable.merchantId, merchant.id), inArray(ordersTable.status, ["paid", "fulfilled"]), isNull(ledgerEntriesTable.id)));
        if (Number(unaccounted?.count ?? 0) > 0) {
          throw new Error("Withdrawals are unavailable until paid orders have verified accounting records");
        }
      }
      const [revenue] = identity.isAdmin
        ? await tx
            .select({
              total: sql<string>`coalesce(sum(${paymentsTable.amount}) filter (where ${paymentsTable.status} = 'confirmed'), 0)`,
            })
            .from(paymentsTable)
            .where(eq(paymentsTable.currency, merchant.currency))
        : await tx
            .select({
              total: sql<string>`coalesce(sum(${ordersTable.total}) filter (where ${ordersTable.status} in ('paid', 'fulfilled')), 0)`,
            })
            .from(ordersTable)
            .where(
              and(
                eq(ordersTable.merchantId, merchant.id),
                eq(ordersTable.currency, merchant.currency),
              ),
            );
      const [subscription] = await tx
        .select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.merchantId, merchant.id))
        .limit(1);
      const [reserved] = await tx
        .select({
          total: sql<string>`coalesce(sum(${withdrawalsTable.amount}) filter (where ${withdrawalsTable.status} in ('pending', 'approved', 'paid')), 0)`,
        })
        .from(withdrawalsTable)
        .where(
          and(
            eq(withdrawalsTable.merchantId, merchant.id),
            eq(withdrawalsTable.currency, merchant.currency),
          ),
        );
      const available =
        toNumber(revenue?.total) -
        (identity.isAdmin ? 0 : toNumber(subscription?.earningsHeld)) -
        toNumber(reserved?.total);
      if (amount > available) {
        throw new Error(`Only ${Math.max(0, available).toFixed(2)} is available to withdraw`);
      }
      const [withdrawal] = await tx
        .insert(withdrawalsTable)
        .values({
          merchantId: merchant.id,
          amount: amount.toFixed(2),
          currency,
          status: "pending",
          beneficiaryName: currentBankAccount.beneficiaryName,
          bankName: currentBankAccount.bankName,
          destinationCiphertext: encryptSecret(
            JSON.stringify({
              bankCode: currentBankAccount.bankCode,
              accountNumber: decryptSecret(
                currentBankAccount.accountNumberCiphertext,
              ),
            }),
          ),
          accountLast4: currentBankAccount.accountLast4,
          idempotencyKey,
        })
        .onConflictDoNothing()
        .returning();
      if (!withdrawal) {
        if (idempotencyKey) {
          const replay = (
            await tx
              .select()
              .from(withdrawalsTable)
              .where(
                and(
                  eq(withdrawalsTable.merchantId, merchant.id),
                  eq(withdrawalsTable.idempotencyKey, idempotencyKey),
                ),
              )
              .limit(1)
          )[0];
          if (replay) return replay;
        }
        throw new Error("Withdrawal request could not be created");
      }
      await tx.insert(activityTable).values({
        merchantId: merchant.id,
        type: "withdrawal_requested",
        title: "TS Pay withdrawal queued",
        description: `A ${currency} TS Pay withdrawal request is waiting for review.`,
        amount: amount.toFixed(2),
        currency,
        tone: "neutral",
      });
      return withdrawal;
    });
    res.status(201).json(CreateWithdrawalResponse.parse(serializeWithdrawal(result)));
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : "Withdrawal request could not be created",
    });
  }
});

router.get("/supplier-products", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const products = await db
    .select()
    .from(supplierProductsTable)
    .where(eq(supplierProductsTable.merchantId, merchant.id))
    .orderBy(desc(supplierProductsTable.importedAt))
    .limit(100);
  res.json(
    ListSupplierProductsResponse.parse(
      products.map((product) => ({
        ...serializeSupplierProduct(product),
      })),
    ),
  );
});

router.get("/supplier-import-history", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const attempts = await db
    .select()
    .from(supplierImportAttemptsTable)
    .where(eq(supplierImportAttemptsTable.merchantId, merchant.id))
    .orderBy(desc(supplierImportAttemptsTable.createdAt))
    .limit(100);
  res.json(
    ListSupplierImportHistoryResponse.parse(
      attempts.map((attempt) => ({
        id: attempt.id,
        supplierProductId: attempt.supplierProductId,
        batchId: attempt.batchId,
        sourceUrl: attempt.sourceUrl,
        status: attempt.status,
        message: attempt.message,
        changes: Array.isArray(attempt.changes) ? attempt.changes : [],
        createdAt: attempt.createdAt,
      })),
    ),
  );
});

router.post("/supplier-products", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  if (!consumeSupplierImportQuota(identity.clerkUserId, 1)) {
    res.status(429).json({ error: "Supplier import limit reached. Try again later." });
    return;
  }
  const parsed = ImportSupplierProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a public supplier product URL" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  try {
    const imported = await importPublicSupplierProduct(parsed.data.sourceUrl);
    const supplierUrl = normalizedSupplierUrl(
      imported.sourceUrl,
      parsed.data.supplierUrl,
    ).url;
    const supplier = await ensureSupplierRecord(merchant.id, supplierUrl);
    const duplicateConditions = [eq(supplierProductsTable.sourceUrl, imported.sourceUrl)];
    if (imported.sourceProductId) {
      duplicateConditions.push(
        eq(supplierProductsTable.sourceProductId, imported.sourceProductId),
      );
    }
    if (imported.sku) {
      duplicateConditions.push(eq(supplierProductsTable.sku, imported.sku));
    }
    const duplicates = await db
      .select()
      .from(supplierProductsTable)
      .where(
        and(eq(supplierProductsTable.merchantId, merchant.id), or(...duplicateConditions)),
      )
      .limit(10);
    const duplicateAction = parsed.data.duplicateAction ?? "update_existing";
    if (duplicates.length && duplicateAction === "review") {
      res.status(409).json({
        error: "A matching supplier product needs your decision",
        duplicates: duplicates.map((product) => ({
          id: product.id,
          title: product.title,
          sourceUrl: product.sourceUrl,
          matchReason:
            product.sourceUrl === imported.sourceUrl
              ? "same source URL"
              : product.sku === imported.sku
                ? "same SKU"
                : "same source product ID",
        })),
      });
      return;
    }
    if (duplicates.length && duplicateAction === "skip") {
      res.status(200).json(ImportSupplierProductResponse.parse(serializeSupplierProduct(duplicates[0])));
      return;
    }
    const existing =
      duplicateAction === "create_new" ? undefined : duplicates[0];
    const values = importedProductValues(imported, parsed.data, supplier.id);
    const [product] = existing
      ? await db
          .update(supplierProductsTable)
          .set(values)
          .where(eq(supplierProductsTable.id, existing.id))
          .returning()
      : await db
          .insert(supplierProductsTable)
          .values({ merchantId: merchant.id, ...values })
          .returning();
    if (!product) throw new Error("Supplier product could not be saved");
    await db.insert(supplierImportAttemptsTable).values({
      merchantId: merchant.id,
      supplierProductId: product.id,
      sourceUrl: imported.sourceUrl,
      status: product.importStatus,
      message: existing ? "Product updated from source" : "Product imported from source",
    });
    res.status(existing ? 200 : 201).json(
      ImportSupplierProductResponse.parse(serializeSupplierProduct(product)),
    );
  } catch (error) {
    res.status(422).json({
      error: error instanceof Error ? error.message : "Supplier page could not be imported",
    });
  }
});

router.post("/supplier-products/analyze", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  if (!consumeSupplierImportQuota(identity.clerkUserId, 1)) {
    res.status(429).json({ error: "Supplier import limit reached. Try again later." });
    return;
  }
  const parsed = AnalyzeSupplierProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a public supplier product URL" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  try {
    const imported = await importPublicSupplierProduct(parsed.data.sourceUrl);
    const duplicateConditions = [eq(supplierProductsTable.sourceUrl, imported.sourceUrl)];
    if (imported.sourceProductId) {
      duplicateConditions.push(
        eq(supplierProductsTable.sourceProductId, imported.sourceProductId),
      );
    }
    if (imported.sku) duplicateConditions.push(eq(supplierProductsTable.sku, imported.sku));
    const duplicates = await db
      .select()
      .from(supplierProductsTable)
      .where(
        and(eq(supplierProductsTable.merchantId, merchant.id), or(...duplicateConditions)),
      )
      .limit(10);
    res.json(
      AnalyzeSupplierProductResponse.parse({
        status: "needs_review",
        preview: serializeSupplierPreview(imported),
        duplicates: duplicates.map((product) => ({
          id: product.id,
          title: product.title,
          sourceUrl: product.sourceUrl,
          matchReason:
            product.sourceUrl === imported.sourceUrl
              ? "same source URL"
              : product.sku === imported.sku
                ? "same SKU"
                : "same source product ID",
        })),
        message: duplicates.length
          ? "Review the matching product before importing."
          : "Review the extracted fields before importing.",
      }),
    );
  } catch (error) {
    res.status(422).json({
      error: error instanceof Error ? error.message : "Supplier page could not be analyzed",
    });
  }
});

router.post("/supplier-products/batch", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = ImportSupplierProductBatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter one or more valid supplier URLs" });
    return;
  }
  if (!consumeSupplierImportQuota(identity.clerkUserId, parsed.data.sourceUrls.length)) {
    res.status(429).json({ error: "Supplier import limit reached. Try again later." });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const [batch] = await db
    .insert(supplierImportBatchesTable)
    .values({
      merchantId: merchant.id,
      sourceCount: parsed.data.sourceUrls.length,
      status: "analyzing",
    })
    .returning();
  if (!batch) {
    res.status(500).json({ error: "Import batch could not be created" });
    return;
  }
  const results: Array<Record<string, unknown>> = [];
  let completedCount = 0;
  for (const sourceUrl of parsed.data.sourceUrls) {
    try {
      const imported = await importPublicSupplierProduct(sourceUrl);
      const supplier = await ensureSupplierRecord(
        merchant.id,
        new URL(imported.sourceUrl).origin,
      );
      const duplicateConditions = [
        eq(supplierProductsTable.sourceUrl, imported.sourceUrl),
      ];
      if (imported.sourceProductId) {
        duplicateConditions.push(
          eq(supplierProductsTable.sourceProductId, imported.sourceProductId),
        );
      }
      if (imported.sku) {
        duplicateConditions.push(eq(supplierProductsTable.sku, imported.sku));
      }
      const duplicates = await db
        .select()
        .from(supplierProductsTable)
        .where(
          and(eq(supplierProductsTable.merchantId, merchant.id), or(...duplicateConditions)),
        )
        .limit(10);
      const duplicateAction = parsed.data.duplicateAction ?? "review";
      if (duplicates.length && duplicateAction === "review") {
        await db.insert(supplierImportAttemptsTable).values({
          merchantId: merchant.id,
          batchId: batch.id,
          sourceUrl: imported.sourceUrl,
          status: "duplicate",
          message: "A matching product needs a duplicate decision",
          changes: duplicates.map((candidate) => ({
            id: candidate.id,
            title: candidate.title,
            matchReason:
              candidate.sourceUrl === imported.sourceUrl
                ? "same source URL"
                : candidate.sku === imported.sku
                  ? "same SKU"
                  : "same source product ID",
          })),
        });
        results.push({
          sourceUrl,
          status: "duplicate",
          message: "A matching product needs your decision",
          duplicates: duplicates.map((candidate) => ({
            id: candidate.id,
            title: candidate.title,
            sourceUrl: candidate.sourceUrl,
          })),
        });
        continue;
      }
      if (duplicates.length && duplicateAction === "skip") {
        await db.insert(supplierImportAttemptsTable).values({
          merchantId: merchant.id,
          batchId: batch.id,
          supplierProductId: duplicates[0].id,
          sourceUrl: imported.sourceUrl,
          status: "skipped",
          message: "Skipped because a matching product already exists",
        });
        results.push({
          sourceUrl,
          status: "skipped",
          product: serializeSupplierProduct(duplicates[0]),
        });
        continue;
      }
      const values = importedProductValues(imported, {
        supplierUrl: supplier.website,
        profitType: parsed.data.profitType,
        profitValue: parsed.data.profitValue,
        inventoryStrategy: parsed.data.inventoryStrategy,
        visibility: "draft",
      }, supplier.id);
      const existing =
        duplicateAction === "create_new" ? undefined : duplicates[0];
      const [product] = existing
        ? await db
            .update(supplierProductsTable)
            .set(values)
            .where(eq(supplierProductsTable.id, existing.id))
            .returning()
        : await db
            .insert(supplierProductsTable)
            .values({ merchantId: merchant.id, ...values })
            .returning();
      if (!product) throw new Error("Product could not be saved");
      await db.insert(supplierImportAttemptsTable).values({
        merchantId: merchant.id,
        supplierProductId: product.id,
        batchId: batch.id,
        sourceUrl: imported.sourceUrl,
        status: existing ? "updated" : "imported",
        message: existing ? "Updated from batch source" : "Imported from batch source",
      });
      completedCount += 1;
      results.push({ sourceUrl, status: "imported", product: serializeSupplierProduct(product) });
    } catch (error) {
      await db.insert(supplierImportAttemptsTable).values({
        merchantId: merchant.id,
        batchId: batch.id,
        sourceUrl,
        status: "failed",
        message: error instanceof Error ? error.message : "Source could not be imported",
      });
      results.push({
        sourceUrl,
        status: "failed",
        message: error instanceof Error ? error.message : "Source could not be imported",
      });
    }
  }
  const failedCount = results.length - completedCount;
  await db
    .update(supplierImportBatchesTable)
    .set({
      status: failedCount ? (completedCount ? "partially_imported" : "failed") : "imported",
      completedCount,
      failedCount,
      completedAt: new Date(),
    })
    .where(eq(supplierImportBatchesTable.id, batch.id));
  res.json(
    ImportSupplierProductBatchResponse.parse({
      batchId: batch.id,
      status: failedCount ? (completedCount ? "partially_imported" : "failed") : "imported",
      results,
    }),
  );
});

router.post("/supplier-products/manual", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = CreateManualSupplierProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a title and selling price for the manual product" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  try {
    const supplierUrl = normalizedSupplierUrl(
      parsed.data.supplierUrl ?? "https://manual.local",
      parsed.data.supplierUrl,
    );
    const supplier = parsed.data.supplierUrl
      ? await ensureSupplierRecord(merchant.id, supplierUrl.url, parsed.data.supplierName)
      : null;
    const sourceUrl = parsed.data.supplierUrl ?? `https://manual.invalid/product/${randomUUID()}`;
    const [product] = await db
      .insert(supplierProductsTable)
      .values({
        merchantId: merchant.id,
        supplierId: supplier?.id ?? null,
        sourceUrl,
        supplierUrl: supplier?.website ?? "https://manual.invalid",
        sourceDomain: supplier?.domain ?? "manual",
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        imageUrl: parsed.data.imageUrl ?? null,
        price: parsed.data.price == null ? null : parsed.data.price.toFixed(2),
        salePrice: parsed.data.salePrice == null ? null : parsed.data.salePrice.toFixed(2),
        currency: parsed.data.currency.toUpperCase(),
        sku: parsed.data.sku ?? null,
        category: parsed.data.category ?? null,
        tags: parsed.data.tags ?? [],
        sellingPrice: parsed.data.sellingPrice.toFixed(2),
        inventoryStrategy: parsed.data.inventoryStrategy ?? "manual",
        inventoryStatus: parsed.data.inventoryStatus ?? "unknown",
        availabilityQuantity: parsed.data.inventoryQuantity ?? null,
        status: "active",
        visibility: "active",
        importStatus: "manual_import_required",
        importedAt: new Date(),
        publishedAt: new Date(),
      })
      .returning();
    if (!product) throw new Error("Manual product could not be saved");
    await db.insert(supplierImportAttemptsTable).values({
      merchantId: merchant.id,
      supplierProductId: product.id,
      sourceUrl,
      status: "manual_import_required",
      message: "Created with merchant-supplied product details",
    });
    res.status(201).json(CreateManualSupplierProductResponse.parse(serializeSupplierProduct(product)));
  } catch (error) {
    res.status(422).json({
      error: error instanceof Error ? error.message : "Manual product could not be saved",
    });
  }
});

router.patch("/supplier-products/:id", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const params = UpdateSupplierProductParams.safeParse(req.params);
  const parsed = UpdateSupplierProductBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Enter valid product details" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const product = (
    await db
      .select()
      .from(supplierProductsTable)
      .where(
        and(
          eq(supplierProductsTable.id, params.data.id),
          eq(supplierProductsTable.merchantId, merchant.id),
        ),
      )
      .limit(1)
  )[0];
  if (!product) {
    res.status(404).json({ error: "Supplier product not found" });
    return;
  }

  const input = parsed.data;
  const has = (key: keyof typeof input) =>
    Object.prototype.hasOwnProperty.call(input, key);
  const nextVisibility = input.visibility ?? product.visibility;
  const nextSellingPrice =
    input.sellingPrice === undefined
      ? product.sellingPrice === null
        ? null
        : toNumber(product.sellingPrice)
      : input.sellingPrice;
  if (nextVisibility === "active" && (!nextSellingPrice || nextSellingPrice <= 0)) {
    res.status(422).json({
      error: "An active product must have a selling price greater than zero",
    });
    return;
  }
  if (input.pricingMode === "custom" && (input.sellingPrice === null || input.sellingPrice === undefined)) {
    res.status(422).json({ error: "Custom pricing requires a selling price" });
    return;
  }

  try {
    const supplierUrl =
      input.supplierUrl === undefined
        ? product.supplierUrl
        : normalizedSupplierUrl(product.sourceUrl, input.supplierUrl).url;
    const sourceFields: Record<string, unknown> = {
      supplierUrl,
      title: input.title,
      description: input.description,
      imageUrl: input.imageUrl,
      imageUrls: input.imageUrls,
      videoUrls: input.videoUrls,
      salePrice: input.salePrice === null ? null : input.salePrice?.toFixed(2),
      currency: input.currency?.toUpperCase(),
      sku: input.sku,
      sourceProductId: input.sourceProductId,
      variants: input.variants,
      attributes: input.attributes,
      availability: input.availability,
      availabilityQuantity:
        input.inventoryQuantity === undefined
          ? input.availabilityQuantity
          : input.inventoryQuantity,
      inventoryStrategy: input.inventoryStrategy,
      inventoryStatus: input.inventoryStatus,
      category: input.category,
      tags: input.tags,
      specifications: input.specifications,
      brand: input.brand,
      shippingInformation: input.shippingInformation,
      taxConfiguration: input.taxConfiguration,
      shippingConfiguration: input.shippingConfiguration,
      seoConfiguration: input.seoConfiguration,
      profitType: input.profitType,
      profitValue:
        input.profitValue === undefined
          ? undefined
          : input.profitValue.toFixed(2),
      pricingMode: input.pricingMode,
      price:
        input.costPrice === undefined
          ? undefined
          : input.costPrice === null
            ? null
            : input.costPrice.toFixed(2),
      sellingPrice:
        input.sellingPrice === undefined
          ? undefined
          : input.sellingPrice === null
            ? null
            : input.sellingPrice.toFixed(2),
      visibility: nextVisibility,
      marketplaceVisibility: input.marketplaceVisibility,
      status: nextVisibility === "active" ? "active" : "draft",
      importStatus: nextVisibility === "active" ? "imported" : "needs_review",
      importError: null,
      publishedAt: nextVisibility === "active" ? product.publishedAt ?? new Date() : null,
      updatedAt: new Date(),
    };
    const updates = Object.fromEntries(
      Object.entries(sourceFields).filter(([key, value]) => {
        if (["visibility", "status", "importStatus", "importError", "publishedAt", "updatedAt"].includes(key)) {
          return true;
        }
        if (key === "supplierUrl") return true;
        const inputKey = key === "price" ? "costPrice" : key;
        return has(inputKey as keyof typeof input);
      }),
    );
    const currentOverrides =
      product.merchantOverrides &&
      typeof product.merchantOverrides === "object" &&
      !Array.isArray(product.merchantOverrides)
        ? product.merchantOverrides as Record<string, unknown>
        : {};
    const overrideKeys = [
      "title",
      "description",
      "imageUrl",
      "imageUrls",
      "videoUrls",
      "salePrice",
      "currency",
      "sku",
      "sourceProductId",
      "variants",
      "attributes",
      "availability",
      "availabilityQuantity",
      "inventoryQuantity",
      "inventoryStrategy",
      "inventoryStatus",
      "category",
      "tags",
      "specifications",
      "brand",
      "shippingInformation",
      "taxConfiguration",
      "shippingConfiguration",
      "seoConfiguration",
      "costPrice",
      "profitType",
      "profitValue",
      "pricingMode",
      "sellingPrice",
      "visibility",
      "marketplaceVisibility",
    ];
    for (const key of overrideKeys) {
      if (has(key as keyof typeof input)) currentOverrides[key] = true;
    }
    updates.merchantOverrides = currentOverrides;
    const [updated] = await db
      .update(supplierProductsTable)
      .set(updates)
      .where(
        and(
          eq(supplierProductsTable.id, product.id),
          eq(supplierProductsTable.merchantId, merchant.id),
        ),
      )
      .returning();
    if (!updated) throw new Error("Supplier product could not be updated");
    await db.insert(supplierImportAttemptsTable).values({
      merchantId: merchant.id,
      supplierProductId: updated.id,
      sourceUrl: updated.sourceUrl,
      status: nextVisibility === "active" ? "published" : "edited",
      message: "Merchant-edited product fields saved",
      changes: Object.keys(updates).filter((key) => key !== "updatedAt"),
    });
    res.json(UpdateSupplierProductResponse.parse(serializeSupplierProduct(updated)));
  } catch (error) {
    res.status(422).json({
      error: error instanceof Error ? error.message : "Supplier product could not be updated",
    });
  }
});

router.post("/supplier-products/:id/refresh", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  if (!consumeSupplierImportQuota(identity.clerkUserId, 1)) {
    res.status(429).json({ error: "Supplier import limit reached. Try again later." });
    return;
  }
  const params = RefreshSupplierProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid supplier product" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const product = (
      await db
        .select()
        .from(supplierProductsTable)
        .where(
          and(
            eq(supplierProductsTable.merchantId, merchant.id),
            eq(supplierProductsTable.id, params.data.id),
          ),
        )
        .limit(1)
    )[0];
  if (!product) {
    res.status(404).json({ error: "Supplier product not found" });
    return;
  }
  try {
    const imported = await importPublicSupplierProduct(product.sourceUrl);
    const source = serializeSupplierPreview(imported);
    const current = serializeSupplierProduct(product);
    const fields = ["title", "description", "imageUrl", "price", "salePrice", "currency", "sku", "sourceProductId", "variants", "attributes", "availability", "availabilityQuantity", "category", "specifications", "brand", "shippingInformation"] as const;
    const changes = fields
      .filter((field) => JSON.stringify(current[field]) !== JSON.stringify(source[field]))
      .map((field) => ({
        field,
        current: current[field],
        incoming: source[field],
        customized: Boolean(jsonRecord(product.merchantOverrides)[field]),
      }));
    await db
      .update(supplierProductsTable)
      .set({ lastAttemptedSync: new Date(), importStatus: changes.length ? "needs_review" : "imported" })
      .where(eq(supplierProductsTable.id, product.id));
    await db.insert(supplierImportAttemptsTable).values({
      merchantId: merchant.id,
      supplierProductId: product.id,
      sourceUrl: product.sourceUrl,
      status: changes.length ? "needs_review" : "imported",
      changes,
    });
    res.json(
      RefreshSupplierProductResponse.parse({
        product: serializeSupplierProduct(product),
        changes,
        message: changes.length ? "Review source changes before accepting them." : "Source is unchanged.",
      }),
    );
  } catch (error) {
    await db
      .update(supplierProductsTable)
      .set({ lastAttemptedSync: new Date(), importStatus: "source_unavailable", importError: error instanceof Error ? error.message : "Source unavailable" })
      .where(eq(supplierProductsTable.id, product.id));
    res.status(422).json({ error: error instanceof Error ? error.message : "Supplier source could not be refreshed" });
  }
});

router.post("/supplier-products/:id/refresh/accept", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const params = AcceptSupplierRefreshParams.safeParse(req.params);
  const parsed = AcceptSupplierRefreshBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Choose at least one refresh field to accept" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const product = (
    await db
      .select()
      .from(supplierProductsTable)
      .where(
        and(
          eq(supplierProductsTable.id, params.data.id),
          eq(supplierProductsTable.merchantId, merchant.id),
        ),
      )
      .limit(1)
  )[0];
  if (!product) {
    res.status(404).json({ error: "Supplier product not found" });
    return;
  }
  try {
    const imported = await importPublicSupplierProduct(product.sourceUrl);
    const accepted = new Set(parsed.data.fields);
    const updates: Record<string, unknown> = {
      importStatus: "imported",
      importError: null,
      lastAttemptedSync: new Date(),
    };
    const sourceFields = {
      title: imported.title,
      description: imported.description,
      imageUrl: imported.imageUrl,
      imageUrls: imported.imageUrls,
      price: imported.price === null ? null : Number(imported.price).toFixed(2),
      salePrice:
        imported.salePrice === null
          ? null
          : Number(imported.salePrice).toFixed(2),
      currency: imported.currency,
      sku: imported.sku,
      sourceProductId: imported.sourceProductId,
      variants: imported.variants,
      attributes: imported.attributes,
      availability: imported.availability,
      availabilityQuantity: imported.availabilityQuantity,
      category: imported.category,
      specifications: imported.specifications,
      brand: imported.brand,
      shippingInformation: imported.shippingInformation,
    };
    for (const [field, value] of Object.entries(sourceFields)) {
      if ((parsed.data.fields as readonly string[]).includes(field)) {
        updates[field] = value;
      }
    }
    const [updated] = await db
      .update(supplierProductsTable)
      .set(updates)
      .where(eq(supplierProductsTable.id, product.id))
      .returning();
    if (!updated) throw new Error("Supplier product could not be updated");
    await db.insert(supplierImportAttemptsTable).values({
      merchantId: merchant.id,
      supplierProductId: product.id,
      sourceUrl: product.sourceUrl,
      status: "imported",
      message: `Accepted ${parsed.data.fields.join(", ")} from source refresh`,
      changes: parsed.data.fields,
    });
    res.json(
      AcceptSupplierRefreshResponse.parse({
        product: serializeSupplierProduct(updated),
        acceptedFields: parsed.data.fields,
        message: "Selected source changes were accepted.",
      }),
    );
  } catch (error) {
    res.status(422).json({
      error: error instanceof Error ? error.message : "Source refresh could not be accepted",
    });
  }
});

router.get("/suppliers", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const suppliers = await db
    .select({
      supplier: suppliersTable,
      productCount: sql<string>`count(${supplierProductsTable.id})`,
    })
    .from(suppliersTable)
    .leftJoin(
      supplierProductsTable,
      eq(supplierProductsTable.supplierId, suppliersTable.id),
    )
    .where(eq(suppliersTable.merchantId, merchant.id))
    .groupBy(suppliersTable.id)
    .orderBy(desc(suppliersTable.updatedAt));
  res.json(
    ListSuppliersResponse.parse(
      suppliers.map(({ supplier, productCount }) =>
        serializeSupplier(supplier, Number(productCount)),
      ),
    ),
  );
});

router.patch("/suppliers/:id", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const params = UpdateSupplierParams.safeParse(req.params);
  const parsed = UpdateSupplierBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Enter valid supplier details" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const existing = (
    await db
      .select()
      .from(suppliersTable)
      .where(
        and(
          eq(suppliersTable.id, params.data.id),
          eq(suppliersTable.merchantId, merchant.id),
        ),
      )
      .limit(1)
  )[0];
  if (!existing) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }
  const [supplier] = await db
    .update(suppliersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(suppliersTable.id, existing.id))
    .returning();
  if (!supplier) {
    res.status(500).json({ error: "Supplier could not be updated" });
    return;
  }
  const [{ productCount }] = await db
    .select({ productCount: sql<string>`count(${supplierProductsTable.id})` })
    .from(supplierProductsTable)
    .where(eq(supplierProductsTable.supplierId, supplier.id));
  res.json(
    UpdateSupplierResponse.parse(
      serializeSupplier(supplier, Number(productCount)),
    ),
  );
});

router.get("/customers", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const customers = await db
    .select({
      customer: customersTable,
      orderCount: sql<string>`count(${ordersTable.id}) filter (where ${ordersTable.status} <> 'cancelled')`,
      totalSpent: sql<string>`coalesce(sum(${ordersTable.total}) filter (where ${inArray(ordersTable.status, ["paid", "fulfilled"])}), 0)`,
    })
    .from(customersTable)
    .leftJoin(ordersTable, eq(ordersTable.customerId, customersTable.id))
    .where(eq(customersTable.merchantId, merchant.id))
    .groupBy(customersTable.id)
    .orderBy(desc(customersTable.createdAt));
  res.json(
    ListCustomersResponse.parse(
      customers.map(({ customer, orderCount, totalSpent }) => ({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        notes: customer.notes,
        tags: Array.isArray(customer.tags) ? customer.tags : [],
        marketingConsent: customer.marketingConsent,
        consentCapturedAt: customer.consentCapturedAt,
        orderCount: Number(orderCount),
        totalSpent: toNumber(totalSpent),
        createdAt: customer.createdAt,
      })),
    ),
  );
});

router.patch("/customers/:id", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const params = UpdateCustomerParams.safeParse(req.params);
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Customer notes, tags, and consent settings are invalid" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const existing = (
    await db.select().from(customersTable).where(and(
      eq(customersTable.id, params.data.id),
      eq(customersTable.merchantId, merchant.id),
    )).limit(1)
  )[0];
  if (!existing) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const [updated] = await db.update(customersTable).set({
    notes: parsed.data.notes?.trim() || null,
    tags: normalizeCustomerTags(parsed.data.tags),
    marketingConsent: parsed.data.marketingConsent,
    consentCapturedAt: parsed.data.marketingConsent
      ? (existing.consentCapturedAt ?? new Date())
      : null,
    updatedAt: new Date(),
  }).where(and(
    eq(customersTable.id, existing.id),
    eq(customersTable.merchantId, merchant.id),
  )).returning();
  if (!updated) {
    res.status(500).json({ error: "Customer profile could not be saved" });
    return;
  }
  await addActivity(merchant.id, {
    type: "customer_profile_updated",
    title: "Customer profile updated",
    description: `Notes, tags, or consent updated for ${updated.name}.`,
    tone: "neutral",
  });
  const [{ orderCount, totalSpent }] = await db.select({
    orderCount: sql<string>`count(${ordersTable.id}) filter (where ${ordersTable.status} <> 'cancelled')`,
    totalSpent: sql<string>`coalesce(sum(${ordersTable.total}) filter (where ${inArray(ordersTable.status, ["paid", "fulfilled"])}), 0)`,
  }).from(ordersTable).where(eq(ordersTable.customerId, updated.id));
  res.json(UpdateCustomerResponse.parse({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    phone: updated.phone,
    notes: updated.notes,
    tags: Array.isArray(updated.tags) ? updated.tags : [],
    marketingConsent: updated.marketingConsent,
    consentCapturedAt: updated.consentCapturedAt,
    orderCount: Number(orderCount),
    totalSpent: toNumber(totalSpent),
    createdAt: updated.createdAt,
  }));
});

router.get("/exports/:resource", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const resource = req.params.resource;
  const merchant = await getOrCreateMerchant(identity);
  const today = new Date().toISOString().slice(0, 10);
  let document: string;
  let filename: string;

  if (resource === "customers") {
    const customers = await db.select().from(customersTable).where(eq(customersTable.merchantId, merchant.id)).orderBy(asc(customersTable.createdAt));
    document = csvDocument(["id", "name", "email", "phone", "notes", "tags", "marketing_consent", "consent_captured_at", "created_at"], customers.map((customer) => [customer.id, customer.name, customer.email, customer.phone, customer.notes, Array.isArray(customer.tags) ? customer.tags.join("|") : "", customer.marketingConsent, customer.consentCapturedAt?.toISOString() ?? "", customer.createdAt.toISOString()]));
    filename = `ts-commerce-customers-${today}.csv`;
  } else if (resource === "orders") {
    const orders = await db.select({ order: ordersTable, customerName: customersTable.name, customerEmail: customersTable.email }).from(ordersTable).innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id)).where(eq(ordersTable.merchantId, merchant.id)).orderBy(asc(ordersTable.createdAt));
    document = csvDocument(["id", "order_number", "customer_name", "customer_email", "total", "quantity", "currency", "status", "fulfillment_status", "created_at"], orders.map(({ order, customerName, customerEmail }) => [order.id, order.orderNumber, customerName, customerEmail, order.total, order.quantity, order.currency, order.status, order.fulfillmentStatus, order.createdAt.toISOString()]));
    filename = `ts-commerce-orders-${today}.csv`;
  } else if (resource === "products") {
    const products = await db.select().from(supplierProductsTable).where(eq(supplierProductsTable.merchantId, merchant.id)).orderBy(asc(supplierProductsTable.importedAt));
    document = csvDocument(["id", "title", "sku", "category", "currency", "selling_price", "visibility", "marketplace_visibility", "inventory_strategy", "inventory_status", "imported_at"], products.map((product) => [product.id, product.title, product.sku, product.category, product.currency, product.sellingPrice, product.visibility, product.marketplaceVisibility, product.inventoryStrategy, product.inventoryStatus, product.importedAt.toISOString()]));
    filename = `ts-commerce-products-${today}.csv`;
  } else if (resource === "transactions") {
    const entries = await db.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.merchantId, merchant.id)).orderBy(asc(ledgerEntriesTable.createdAt));
    document = csvDocument(["id", "order_id", "amount_minor", "currency", "entry_type", "reference_key", "created_at"], entries.map((entry) => [entry.id, entry.orderId, entry.amountMinor, entry.currency, entry.entryType, entry.referenceKey, entry.createdAt.toISOString()]));
    filename = `ts-commerce-transactions-${today}.csv`;
  } else {
    res.status(404).json({ error: "Unknown export resource" });
    return;
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(`${document}\n`);
});

router.get("/orders", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const orders = await db
    .select({
      order: ordersTable,
      customer: customersTable,
      product: supplierProductsTable,
    })
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .leftJoin(
      supplierProductsTable,
      eq(ordersTable.supplierProductId, supplierProductsTable.id),
    )
    .where(eq(ordersTable.merchantId, merchant.id))
    .orderBy(desc(ordersTable.createdAt))
    .limit(100);
  res.json(
    ListOrdersResponse.parse(
      orders.map(({ order, customer, product }) =>
        serializeOrder(order, customer, product),
      ),
    ),
  );
});

router.post("/orders", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Customer details and a positive sale total are required" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const enforced = await enforceSubscription(merchant, identity.isAdmin);
  if (enforced.merchant.status === "suspended" || enforced.merchant.status === "banned") {
    res.status(403).json({ error: "New orders are paused for this account" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from ${subscriptionsTable} where ${subscriptionsTable.merchantId} = ${merchant.id} for update`,
      );
      const subscription = (
        await tx
          .select()
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.merchantId, merchant.id))
          .limit(1)
      )[0];
      if (!subscription) throw new Error("Subscription not found");

      const idempotencyKey = parsed.data.idempotencyKey?.trim() || null;
      if (idempotencyKey) {
        const existing = (
          await tx
            .select({
              order: ordersTable,
              customer: customersTable,
              product: supplierProductsTable,
            })
            .from(ordersTable)
            .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
            .leftJoin(
              supplierProductsTable,
              eq(ordersTable.supplierProductId, supplierProductsTable.id),
            )
            .where(
              and(
                eq(ordersTable.merchantId, merchant.id),
                eq(ordersTable.idempotencyKey, idempotencyKey),
              ),
            )
            .limit(1)
        )[0];
        if (existing) return existing;
      }

      const customerEmail = parsed.data.customerEmail.trim().toLowerCase();
      let customer = (
        await tx
          .select()
          .from(customersTable)
          .where(
            and(
              eq(customersTable.merchantId, merchant.id),
              eq(customersTable.email, customerEmail),
            ),
          )
          .limit(1)
      )[0];
      if (customer) {
        [customer] = await tx
          .update(customersTable)
          .set({
            name: parsed.data.customerName.trim(),
            phone: parsed.data.customerPhone?.trim() || null,
          })
          .where(eq(customersTable.id, customer.id))
          .returning();
      } else {
        [customer] = await tx
          .insert(customersTable)
          .values({
            merchantId: merchant.id,
            name: parsed.data.customerName.trim(),
            email: customerEmail,
            phone: parsed.data.customerPhone?.trim() || null,
          })
          .onConflictDoNothing({
            target: [customersTable.merchantId, customersTable.email],
          })
          .returning();
        if (!customer) {
          customer = (
            await tx
              .select()
              .from(customersTable)
              .where(
                and(
                  eq(customersTable.merchantId, merchant.id),
                  eq(customersTable.email, customerEmail),
                ),
              )
              .limit(1)
          )[0];
        }
      }
      if (!customer) throw new Error("Could not save customer");

      const total = parsed.data.total.toFixed(2);
      const orderNumber =
        parsed.data.orderNumber?.trim().toUpperCase() ||
        `ORD-${randomUUID().slice(0, 8).toUpperCase()}`;
      // A client-provided status is not accounting evidence. All manually
      // created orders enter the ledger as pending and must be paid through
      // the payment-intent verification flow.
      const status = "pending";
      let supplierProduct: typeof supplierProductsTable.$inferSelect | undefined;
      if (parsed.data.supplierProductId) {
        supplierProduct = (
          await tx
            .select()
            .from(supplierProductsTable)
            .where(
              and(
                eq(supplierProductsTable.id, parsed.data.supplierProductId),
                eq(supplierProductsTable.merchantId, merchant.id),
              ),
            )
            .limit(1)
        )[0];
        if (!supplierProduct) {
          throw new Error("That supplier product is not in your catalog");
        }
      }
      const [order] = await tx
        .insert(ordersTable)
        .values({
          merchantId: merchant.id,
          customerId: customer.id,
          orderNumber,
           subtotal: total,
           taxAmount: "0.00",
           shippingAmount: "0.00",
          total,
          currency: merchant.currency,
          status,
          supplierProductId: supplierProduct?.id ?? null,
          shippingAddress: parsed.data.shippingAddress?.trim() || null,
          fulfillmentStatus: supplierProduct
            ? "awaiting_supplier"
            : "not_applicable",
          idempotencyKey,
        })
        .onConflictDoNothing({
          target: [ordersTable.merchantId, ordersTable.idempotencyKey],
        })
        .returning();
      if (!order) {
        if (idempotencyKey) {
          const replay = (
            await tx
              .select({
                order: ordersTable,
                customer: customersTable,
                product: supplierProductsTable,
              })
              .from(ordersTable)
              .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
              .leftJoin(
                supplierProductsTable,
                eq(ordersTable.supplierProductId, supplierProductsTable.id),
              )
              .where(
                and(
                  eq(ordersTable.merchantId, merchant.id),
                  eq(ordersTable.idempotencyKey, idempotencyKey),
                ),
              )
              .limit(1)
          )[0];
          if (replay) return replay;
        }
        throw new Error("Order number is already in use");
      }

      await tx.insert(activityTable).values({
        merchantId: merchant.id,
        type: "order_recorded",
        title: `Order ${orderNumber} recorded`,
        description: `${customer.name} placed a ${status} order.`,
        amount: total,
        tone: "positive",
      });
      return { order, customer, product: supplierProduct ?? null };
    });

    res.status(201).json(
      CreateOrderResponse.parse(
        serializeOrder(result.order, result.customer, result.product),
      ),
    );
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : "Order could not be recorded",
    });
  }
});

router.patch("/orders/:id/status", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const params = UpdateOrderStatusParams.safeParse(req.params);
  const parsed = UpdateOrderStatusBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Choose paid or cancelled" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from ${ordersTable} where ${ordersTable.id} = ${params.data.id} and ${ordersTable.merchantId} = ${merchant.id} for update`,
      );
      const existing = (
        await tx
          .select({
            order: ordersTable,
            customer: customersTable,
            product: supplierProductsTable,
          })
          .from(ordersTable)
          .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
          .leftJoin(
            supplierProductsTable,
            eq(ordersTable.supplierProductId, supplierProductsTable.id),
          )
          .where(
            and(
              eq(ordersTable.id, params.data.id),
              eq(ordersTable.merchantId, merchant.id),
            ),
          )
          .limit(1)
      )[0];
      if (!existing) throw new Error("Order not found");
      const nextStatus = parsed.data.status;
      if (existing.order.status === nextStatus) return existing;
      if (existing.order.status !== "pending") {
        throw new Error("Only pending checkout orders can be changed");
      }
      if (nextStatus === "cancelled") {
        const [order] = await tx
          .update(ordersTable)
          .set({ status: "cancelled" })
          .where(eq(ordersTable.id, existing.order.id))
          .returning();
        if (!order) throw new Error("Order could not be cancelled");
        const reservation = (await tx.select().from(inventoryReservationsTable).where(and(eq(inventoryReservationsTable.orderId, order.id), eq(inventoryReservationsTable.merchantId, merchant.id), eq(inventoryReservationsTable.status, "reserved"))).limit(1))[0];
        if (reservation) {
          await tx.update(inventoryReservationsTable).set({ status: "released", updatedAt: new Date() }).where(and(eq(inventoryReservationsTable.id, reservation.id), eq(inventoryReservationsTable.status, "reserved")));
        }
        await tx.insert(activityTable).values({
          merchantId: merchant.id,
          type: "order_cancelled",
          title: `Checkout ${order.orderNumber} cancelled`,
          description: "The customer checkout was cancelled before payment.",
          tone: "warning",
        });
        return { ...existing, order };
      }

      // A status toggle is not accounting evidence. Payment verification is
      // the only path that may create an authoritative sale ledger entry.
      throw new Error("Submit and verify payment evidence before confirming this order");

      await tx.execute(
        sql`select id from ${subscriptionsTable} where ${subscriptionsTable.merchantId} = ${merchant.id} for update`,
      );
      const subscription = (
        await tx
          .select()
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.merchantId, merchant.id))
          .limit(1)
      )[0];
      if (!subscription) throw new Error("Subscription not found");
      const outstanding = Math.max(
        0,
        toNumber(subscription.amountDue) - toNumber(subscription.amountPaid),
      );
      const availableToHold = Math.max(
        0,
        outstanding - toNumber(subscription.earningsHeld),
      );
      const holdAmount = Math.min(toNumber(existing.order.total), availableToHold);
      const [order] = await tx
        .update(ordersTable)
        .set({ status: "paid" })
        .where(eq(ordersTable.id, existing.order.id))
        .returning();
      if (!order) throw new Error("Order could not be confirmed");
      if (holdAmount > 0) {
        await tx
          .update(subscriptionsTable)
          .set({
            earningsHeld: (
              toNumber(subscription.earningsHeld) + holdAmount
            ).toFixed(2),
          })
          .where(eq(subscriptionsTable.id, subscription.id));
      }
      await tx.insert(activityTable).values({
        merchantId: merchant.id,
        type: "order_payment_confirmed",
        title: `Payment confirmed for ${order.orderNumber}`,
        description: "Customer payment was confirmed and the sale entered the ledger.",
        amount: order.total,
        tone: "positive",
      });
      return { ...existing, order };
    });
    res.json(
      UpdateOrderStatusResponse.parse(
        serializeOrder(result.order, result.customer, result.product),
      ),
    );
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : "Order status could not be updated",
    });
  }
});

router.get("/marketplace/products", async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 120) : "";
  const category = typeof req.query.category === "string" ? req.query.category.trim().slice(0, 120) : "";
  const currency = typeof req.query.currency === "string" ? req.query.currency.trim().toUpperCase() : "";
  const minPrice = typeof req.query.minPrice === "string" ? Number(req.query.minPrice) : null;
  const maxPrice = typeof req.query.maxPrice === "string" ? Number(req.query.maxPrice) : null;
  const filters = [
    eq(merchantsTable.status, "active"),
    eq(supplierProductsTable.status, "active"),
    eq(supplierProductsTable.marketplaceVisibility, true),
    sql`${supplierProductsTable.sellingPrice} is not null`,
  ];
  if (search) filters.push(sql`(${supplierProductsTable.title} ilike ${`%${search}%`} or coalesce(${supplierProductsTable.description}, '') ilike ${`%${search}%`})`);
  if (category) filters.push(eq(supplierProductsTable.category, category));
  if (currency) filters.push(eq(supplierProductsTable.currency, currency));
  if (Number.isFinite(minPrice) && minPrice !== null) filters.push(gte(supplierProductsTable.sellingPrice, minPrice.toFixed(2)));
  if (Number.isFinite(maxPrice) && maxPrice !== null) filters.push(sql`${supplierProductsTable.sellingPrice} <= ${maxPrice.toFixed(2)}`);
  const rows = await db
    .select({ product: supplierProductsTable, merchantKey: merchantsTable.clerkUserId, merchantName: merchantsTable.storeName })
    .from(supplierProductsTable)
    .innerJoin(merchantsTable, eq(supplierProductsTable.merchantId, merchantsTable.id))
    .where(and(...filters))
    .orderBy(desc(supplierProductsTable.publishedAt), desc(supplierProductsTable.importedAt))
    .limit(100);
  res.json(ListMarketplaceProductsResponse.parse(rows.map(({ product, merchantKey, merchantName }) => ({
    id: product.id,
    merchantKey,
    merchantName: merchantName || "Independent merchant",
    title: product.title,
    description: product.description,
    imageUrl: product.imageUrl,
    price: toNumber(product.sellingPrice),
    salePrice: product.salePrice === null ? null : toNumber(product.salePrice),
    currency: product.currency,
    category: product.category,
    brand: product.brand,
    availability: product.availability,
    availabilityQuantity: product.availabilityQuantity,
  }))));
});

router.get("/public/store/:merchantKey", async (req, res): Promise<void> => {
  const parsed = GetPublicStoreParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid store link" });
    return;
  }
  const merchant = (
    await db
      .select()
      .from(merchantsTable)
      .where(eq(merchantsTable.clerkUserId, parsed.data.merchantKey))
      .limit(1)
  )[0];
  if (!merchant || merchant.status !== "active") {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  const products = await db
    .select()
    .from(supplierProductsTable)
    .where(
      and(
        eq(supplierProductsTable.merchantId, merchant.id),
        eq(supplierProductsTable.status, "active"),
        sql`${supplierProductsTable.sellingPrice} is not null`,
      ),
    )
    .orderBy(desc(supplierProductsTable.importedAt))
    .limit(100);
  res.json(
    GetPublicStoreResponse.parse({
      merchantKey: parsed.data.merchantKey,
      storeName: merchant.storeName,
      products: products.map((product) => ({
        id: product.id,
        title: product.title,
        description: product.description,
        imageUrl: product.imageUrl,
        price: toNumber(product.sellingPrice),
        salePrice: product.salePrice === null ? null : toNumber(product.salePrice),
        currency: product.currency,
        sku: product.sku,
        availability: product.availability,
        inventoryStatus: product.inventoryStatus,
        inventoryQuantity: product.availabilityQuantity,
        variants: Array.isArray(product.variants) ? product.variants : [],
        category: product.category,
      })),
    }),
  );
});

router.post(
  "/public/store/:merchantKey/checkout",
  async (req, res): Promise<void> => {
    const params = CreatePublicCheckoutParams.safeParse(req.params);
    const parsed = CreatePublicCheckoutBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error:
          "Choose a product and enter valid customer and shipping details",
      });
      return;
    }
    const merchant = (
      await db
        .select()
        .from(merchantsTable)
        .where(eq(merchantsTable.clerkUserId, params.data.merchantKey))
        .limit(1)
    )[0];
    if (!merchant || merchant.status !== "active") {
      res.status(404).json({ error: "Store not found" });
      return;
    }
    try {
      const result = await db.transaction(async (tx) => {
        const existing = (
          await tx
            .select({ order: ordersTable, product: supplierProductsTable })
            .from(ordersTable)
            .innerJoin(
              supplierProductsTable,
              eq(ordersTable.supplierProductId, supplierProductsTable.id),
            )
            .where(
              and(
                eq(ordersTable.merchantId, merchant.id),
                eq(ordersTable.idempotencyKey, parsed.data.idempotencyKey),
              ),
            )
            .limit(1)
        )[0];
        if (existing) return existing;

        const product = (
          await tx
            .select()
            .from(supplierProductsTable)
            .where(
              and(
                eq(supplierProductsTable.id, parsed.data.supplierProductId),
                eq(supplierProductsTable.merchantId, merchant.id),
                eq(supplierProductsTable.status, "active"),
                sql`${supplierProductsTable.sellingPrice} is not null`,
              ),
            )
            .limit(1)
        )[0];
        if (!product || product.sellingPrice === null) {
          throw new Error("That product is no longer available");
        }
        await tx.execute(
          sql`select id from ${supplierProductsTable} where id=${product.id} and merchant_id=${merchant.id} for update`,
        );
        await tx
          .update(inventoryReservationsTable)
          .set({ status: "expired", updatedAt: new Date() })
          .where(
            and(
              eq(inventoryReservationsTable.merchantId, merchant.id),
              eq(inventoryReservationsTable.supplierProductId, product.id),
              eq(inventoryReservationsTable.status, "reserved"),
              lt(inventoryReservationsTable.expiresAt, new Date()),
            ),
          );
        const quantity = parsed.data.quantity;
        if (!Number.isInteger(quantity) || quantity < 1) {
          throw new Error("Quantity must be a positive integer");
        }
        if (product.inventoryStrategy !== "source_based" && product.availabilityQuantity !== null) {
          const [reserved] = await tx
            .select({
              quantity: sql<string>`coalesce(sum(${inventoryReservationsTable.quantity}), 0)`,
            })
            .from(inventoryReservationsTable)
            .where(
              and(
                eq(inventoryReservationsTable.merchantId, merchant.id),
                eq(inventoryReservationsTable.supplierProductId, product.id),
                eq(inventoryReservationsTable.status, "reserved"),
                gte(inventoryReservationsTable.expiresAt, new Date()),
              ),
            );
          if (quantity > product.availabilityQuantity - Number(reserved?.quantity ?? 0)) {
            throw new Error("Insufficient inventory");
          }
        }
        const subtotal = Number(
          (toNumber(product.sellingPrice) * quantity).toFixed(2),
        );
        const shippingAmount = merchant.freeShippingThreshold !== null
          && subtotal >= toNumber(merchant.freeShippingThreshold)
          ? 0
          : toNumber(merchant.shippingFee);
        const taxAmount = Number(
          (subtotal * toNumber(merchant.taxRate) / 100).toFixed(2),
        );
        const total = Number(
          (subtotal + shippingAmount + taxAmount).toFixed(2),
        );
         const email = parsed.data.customerEmail.trim().toLowerCase();
         const marketingConsent = parsed.data.marketingConsent;
        let customer = (
          await tx
            .select()
            .from(customersTable)
            .where(
              and(
                eq(customersTable.merchantId, merchant.id),
                eq(customersTable.email, email),
              ),
            )
            .limit(1)
        )[0];
        if (customer) {
          [customer] = await tx
            .update(customersTable)
            .set({
              name: parsed.data.customerName.trim(),
              phone: parsed.data.customerPhone?.trim() || null,
              ...(marketingConsent === undefined ? {} : {
                marketingConsent,
                consentCapturedAt: marketingConsent ? (customer.consentCapturedAt ?? new Date()) : null,
              }),
            })
            .where(eq(customersTable.id, customer.id))
            .returning();
        } else {
          [customer] = await tx
            .insert(customersTable)
            .values({
              merchantId: merchant.id,
              name: parsed.data.customerName.trim(),
              email,
              phone: parsed.data.customerPhone?.trim() || null,
              marketingConsent: marketingConsent ?? false,
              consentCapturedAt: marketingConsent ? new Date() : null,
            })
            .returning();
        }
        if (!customer) throw new Error("Customer could not be saved");
        const [order] = await tx
          .insert(ordersTable)
          .values({
            merchantId: merchant.id,
            customerId: customer.id,
            orderNumber: `WEB-${randomUUID().slice(0, 8).toUpperCase()}`,
            subtotal: subtotal.toFixed(2),
            taxAmount: taxAmount.toFixed(2),
            shippingAmount: shippingAmount.toFixed(2),
            total: total.toFixed(2),
            quantity,
            currency: product.currency,
            status: "pending",
            supplierProductId: product.id,
            shippingAddress: parsed.data.shippingAddress.trim(),
            fulfillmentStatus: "awaiting_supplier",
            idempotencyKey: parsed.data.idempotencyKey,
          })
          .onConflictDoNothing({
            target: [ordersTable.merchantId, ordersTable.idempotencyKey],
          })
          .returning();
        if (!order) {
          const replay = (
            await tx
              .select({ order: ordersTable, product: supplierProductsTable })
              .from(ordersTable)
              .innerJoin(
                supplierProductsTable,
                eq(ordersTable.supplierProductId, supplierProductsTable.id),
              )
              .where(
                and(
                  eq(ordersTable.merchantId, merchant.id),
                  eq(ordersTable.idempotencyKey, parsed.data.idempotencyKey),
                ),
              )
              .limit(1)
          )[0];
          if (replay) return replay;
          throw new Error("Checkout order could not be created");
        }
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        await tx.insert(inventoryReservationsTable).values({
          merchantId: merchant.id,
          supplierProductId: product.id,
          orderId: order.id,
          quantity,
          status: "reserved",
          expiresAt,
        });
        await tx.insert(activityTable).values({
          merchantId: merchant.id,
          type: "checkout_submitted",
          title: `Checkout ${order.orderNumber} received`,
          description: `${customer.name} submitted a ${quantity} item order awaiting payment confirmation.`,
          amount: total.toFixed(2),
          currency: product.currency,
          tone: "neutral",
        });
        return { order, product };
      });
      res
        .status(201)
        .json(
          CreatePublicCheckoutResponse.parse(
            serializePublicCheckoutOrder(result.order, result.product),
          ),
        );
    } catch (error) {
      req.log.error({ err: error }, "public checkout failed");
      res.status(409).json({
        error:
          error instanceof Error
            ? error.message
            : "Checkout order could not be created",
      });
    }
  },
);

router.get("/dropship/queue", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const queue = await db
    .select({
      order: ordersTable,
      customer: customersTable,
      product: supplierProductsTable,
    })
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .innerJoin(
      supplierProductsTable,
      eq(ordersTable.supplierProductId, supplierProductsTable.id),
    )
    .where(
      and(
        eq(ordersTable.merchantId, merchant.id),
        inArray(ordersTable.status, ["paid", "fulfilled"]),
      ),
    )
    .orderBy(desc(ordersTable.createdAt))
    .limit(100);
  res.json(
    ListDropshipQueueResponse.parse(
      queue.map(({ order, customer, product }) =>
        serializeDropshipQueueItem(order, customer, product),
      ),
    ),
  );
});

router.post("/dropship/queue/:id", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const params = CreateSupplierPaymentParams.safeParse(req.params);
  const parsed = CreateSupplierPaymentBody.safeParse(req.body ?? {});
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Enter a valid supplier payment reference" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from ${ordersTable} where ${ordersTable.id} = ${params.data.id} and ${ordersTable.merchantId} = ${merchant.id} for update`,
      );
      const existing = (
        await tx
          .select({ order: ordersTable, product: supplierProductsTable })
          .from(ordersTable)
          .innerJoin(
            supplierProductsTable,
            eq(ordersTable.supplierProductId, supplierProductsTable.id),
          )
          .where(
            and(
              eq(ordersTable.id, params.data.id),
              eq(ordersTable.merchantId, merchant.id),
            ),
          )
          .limit(1)
      )[0];
      if (!existing) throw new Error("Dropshipping order not found");
      if (!["paid", "fulfilled"].includes(existing.order.status)) {
        throw new Error("Confirm the customer payment before paying the supplier");
      }
      if (existing.product.price === null) {
        throw new Error("This product has no supplier cost recorded");
      }
      const amountMinor = Math.round(toNumber(existing.product.price) * existing.order.quantity * 100);
      if (amountMinor <= 0) throw new Error("Supplier payment amount must be positive");
      const [balance] = await tx
        .select({ total: sql<string>`coalesce(sum(${ledgerEntriesTable.amountMinor}), 0)` })
        .from(ledgerEntriesTable)
        .where(
          and(
            eq(ledgerEntriesTable.merchantId, merchant.id),
            eq(ledgerEntriesTable.currency, existing.order.currency),
          ),
        );
      const balanceMinor = Number(balance?.total ?? 0);
      if (existing.order.supplierPaymentStatus === "paid") {
        return {
          orderId: existing.order.id,
          orderNumber: existing.order.orderNumber,
          status: "paid" as const,
          amountMinor: existing.order.supplierPaymentAmountMinor ?? amountMinor,
          currency: existing.order.currency,
          supplierPaymentReference: existing.order.supplierPaymentReference ?? `supplier:${existing.order.orderNumber}`,
          supplierPaidAt: existing.order.supplierPaidAt ?? new Date(),
          availableBalanceMinor: balanceMinor,
        };
      }
      if (balanceMinor < amountMinor) {
        throw new Error(`Insufficient ${existing.order.currency} funds. Available balance is ${(Math.max(0, balanceMinor) / 100).toFixed(2)}`);
      }
      const supplierPaymentReference = parsed.data.supplierPaymentReference?.trim() || `supplier:${existing.order.orderNumber}`;
      const supplierPaidAt = new Date();
      await tx.insert(ledgerEntriesTable).values({
        merchantId: merchant.id,
        orderId: existing.order.id,
        amountMinor: -amountMinor,
        currency: existing.order.currency,
        entryType: "supplier_payment",
        referenceKey: `supplier-payment:${existing.order.id}`,
      });
      await tx
        .update(ordersTable)
        .set({
          supplierPaymentStatus: "paid",
          supplierPaymentReference,
          supplierPaymentAmountMinor: amountMinor,
          supplierPaidAt,
        })
        .where(eq(ordersTable.id, existing.order.id));
      await tx.insert(activityTable).values({
        merchantId: merchant.id,
        type: "supplier_payment_recorded",
        title: `Supplier funds allocated for ${existing.order.orderNumber}`,
        description: "The supplier cost was debited from the internal TS Pay ledger after verified customer payment.",
        amount: (amountMinor / 100).toFixed(2),
        currency: existing.order.currency,
        tone: "negative",
      });
      return {
        orderId: existing.order.id,
        orderNumber: existing.order.orderNumber,
        status: "paid" as const,
        amountMinor,
        currency: existing.order.currency,
        supplierPaymentReference,
        supplierPaidAt,
        availableBalanceMinor: balanceMinor - amountMinor,
      };
    });
    res.status(201).json(CreateSupplierPaymentResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error }, "supplier payment failed");
    res.status(409).json({ error: error instanceof Error ? error.message : "Supplier payment could not be recorded" });
  }
});

router.patch("/dropship/queue/:id", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const params = UpdateDropshipStatusParams.safeParse(req.params);
  const parsed = UpdateDropshipStatusBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Choose a valid supplier fulfillment status" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const nextStatus = parsed.data.fulfillmentStatus;
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from ${ordersTable} where ${ordersTable.id} = ${params.data.id} and ${ordersTable.merchantId} = ${merchant.id} for update`,
    );
    const existing = (
      await tx
        .select({
          order: ordersTable,
          customer: customersTable,
          product: supplierProductsTable,
        })
        .from(ordersTable)
        .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
        .innerJoin(
          supplierProductsTable,
          eq(ordersTable.supplierProductId, supplierProductsTable.id),
        )
        .where(
          and(
            eq(ordersTable.id, params.data.id),
            eq(ordersTable.merchantId, merchant.id),
          ),
        )
        .limit(1)
    )[0];
    if (!existing) throw new Error("Dropshipping order not found");
    const currentStatus = existing.order.fulfillmentStatus;
    const allowedTransitions: Record<string, string[]> = {
      not_submitted: ["not_submitted", "submitted", "canceled", "failed"],
      submitted: ["submitted", "accepted", "processing", "canceled", "failed"],
      accepted: ["accepted", "processing", "canceled", "failed"],
      processing: ["processing", "shipped", "canceled", "failed"],
      shipped: ["shipped", "in_transit", "delivered", "failed"],
      in_transit: ["in_transit", "delivered", "failed"],
      delivered: ["delivered"],
      canceled: ["canceled"],
      failed: ["failed", "submitted"],
    };
    if (!(allowedTransitions[currentStatus] ?? []).includes(nextStatus)) {
      throw new Error(
        `Cannot move supplier fulfillment from ${currentStatus.replaceAll("_", " ")} to ${nextStatus.replaceAll("_", " ")}`,
      );
    }
    const fulfillmentStarted =
      existing.order.fulfillmentSubmittedAt ??
      (nextStatus !== "not_submitted" ? new Date() : null);
    const [order] = await tx
      .update(ordersTable)
      .set({
        fulfillmentStatus: nextStatus,
        status: nextStatus === "delivered" ? "fulfilled" : existing.order.status,
        supplierOrderReference:
          parsed.data.supplierOrderReference === undefined
            ? existing.order.supplierOrderReference
            : parsed.data.supplierOrderReference,
        trackingNumber:
          parsed.data.trackingNumber === undefined
            ? existing.order.trackingNumber
            : parsed.data.trackingNumber,
        fulfillmentNote:
          parsed.data.fulfillmentNote === undefined
            ? existing.order.fulfillmentNote
            : parsed.data.fulfillmentNote,
        fulfillmentSubmittedAt: fulfillmentStarted,
        fulfillmentUpdatedAt: new Date(),
      })
      .where(eq(ordersTable.id, existing.order.id))
      .returning();
    if (!order) throw new Error("Dropshipping status could not be updated");
    await tx.insert(activityTable).values({
      merchantId: merchant.id,
      type: "dropship_status_updated",
      title: `Order ${order.orderNumber} supplier status updated`,
      description: `Supplier handoff marked ${nextStatus.replaceAll("_", " ")}${order.supplierOrderReference ? ` with reference ${order.supplierOrderReference}.` : "."}`,
      tone: nextStatus === "delivered" ? "positive" : "neutral",
    });
    return { order, customer: existing.customer, product: existing.product };
  });
  res.json(
    UpdateDropshipStatusResponse.parse(
      serializeDropshipQueueItem(result.order, result.customer, result.product),
    ),
  );
});

router.get("/subscription", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const enforced = await enforceSubscription(merchant, identity.isAdmin);
  res.json(
    GetSubscriptionResponse.parse(
      serializeSubscription(
        enforced.merchant,
        enforced.subscription,
        identity.isAdmin,
      ),
    ),
  );
});

router.post("/subscription", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = CreateSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid subscription payment method" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  if (identity.isAdmin) {
    const subscription = await getSubscriptionForMerchant(
      merchant,
      identity.isAdmin,
    );
    res
      .status(201)
      .json(
        CreateSubscriptionResponse.parse(
          serializeSubscription(merchant, subscription, identity.isAdmin),
        ),
      );
    return;
  }
  if (parsed.data.method === "earnings") {
    try {
      const result = await payFromEarnings(merchant);
      res
        .status(201)
        .json(
          CreateSubscriptionResponse.parse(
            serializeSubscription(merchant, result.subscription),
          ),
        );
    } catch (error) {
      res
        .status(409)
        .json({ error: error instanceof Error ? error.message : "Payment failed" });
    }
    return;
  }
  const subscription = await getSubscriptionForMerchant(
    merchant,
    identity.isAdmin,
  );
  const [updated] = await db
    .update(subscriptionsTable)
    .set({ paymentMethod: "bank" })
    .where(eq(subscriptionsTable.id, subscription.id))
    .returning();
  res
    .status(201)
    .json(
      CreateSubscriptionResponse.parse(
        serializeSubscription(merchant, updated),
      ),
    );
});

router.post("/subscription/use-earnings", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  if (identity.isAdmin) {
    res.status(409).json({ error: "Master admin account is subscription exempt" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  try {
    const { payment } = await payFromEarnings(merchant);
    res
      .status(201)
      .json(
        PaySubscriptionFromEarningsResponse.parse(
          serializePayment(payment, merchant.name),
        ),
      );
  } catch (error) {
    res
      .status(409)
      .json({ error: error instanceof Error ? error.message : "Payment failed" });
  }
});

router.post("/subscription/bank-transfer", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  if (identity.isAdmin) {
    res.status(409).json({ error: "Master admin account is subscription exempt" });
    return;
  }
  const parsed = SubmitBankTransferBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Amount, sender name, and transfer reference are required" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  if (merchant.status === "banned") {
    res.status(403).json({ error: "Banned accounts cannot submit subscription payments" });
    return;
  }
  const enforced = await enforceSubscription(merchant, identity.isAdmin);
  const amount = Number(parsed.data.amount.toFixed(2));
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "Enter a valid payment amount" });
    return;
  }
  const remaining = Math.max(
    0,
    toNumber(enforced.subscription.amountDue) -
      toNumber(enforced.subscription.amountPaid),
  );
  if (remaining === 0) {
    res.status(409).json({ error: "Subscription is already settled" });
    return;
  }
  if (amount > remaining) {
    res.status(409).json({ error: `The payment cannot exceed the ${remaining.toFixed(2)} outstanding balance` });
    return;
  }
  const reference = parsed.data.reference.trim().toUpperCase();
  if (reference.startsWith("EARN-SUB-")) {
    res.status(400).json({
      error: "That reference format is reserved for internal earnings payments",
    });
    return;
  }
  const existing = (
    await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.reference, reference))
      .limit(1)
  )[0];
  if (existing) {
    if (existing.merchantId === merchant.id) {
      res.json(
        SubmitBankTransferResponse.parse(
          serializePayment(existing, merchant.name),
        ),
      );
      return;
    }
    res.status(409).json({
      error: "This transfer reference is already associated with another account",
    });
    return;
  }

  try {
    const payment = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from ${subscriptionsTable} where ${subscriptionsTable.id} = ${enforced.subscription.id} for update`,
      );
      const currentSubscription = (
        await tx
          .select()
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.id, enforced.subscription.id))
          .limit(1)
      )[0];
      if (!currentSubscription) throw new Error("Subscription not found");
      const [pendingTransfers] = await tx
        .select({
          total: sql<string>`coalesce(sum(${paymentsTable.amount}) filter (where ${paymentsTable.status} = 'under_review' and ${paymentsTable.method} = 'bank_transfer'), 0)`,
        })
        .from(paymentsTable)
        .where(eq(paymentsTable.merchantId, merchant.id));
      const currentOutstanding = Math.max(
        0,
        toNumber(currentSubscription.amountDue) -
          toNumber(currentSubscription.amountPaid),
      );
      const availableForReview = currentOutstanding - toNumber(pendingTransfers?.total);
      if (amount > availableForReview) {
        throw new Error(
          `Only ${Math.max(0, availableForReview).toFixed(2)} remains available for transfer review`,
        );
      }
    const [created] = await tx
      .insert(paymentsTable)
      .values({
        merchantId: merchant.id,
        amount: amount.toFixed(2),
        currency: merchant.currency,
        method: "bank_transfer",
        reference,
        senderName: parsed.data.senderName.trim(),
        status: "under_review",
      })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      const prior = (
        await tx
          .select()
          .from(paymentsTable)
          .where(eq(paymentsTable.reference, reference))
          .limit(1)
      )[0];
      if (prior?.merchantId === merchant.id) return prior;
      throw new Error(
        "This transfer reference is already associated with another account",
      );
    }
    await tx
      .update(subscriptionsTable)
      .set({
        paymentMethod: "bank",
        status:
          merchant.status === "suspended" ? "expired" : "past_due",
      })
      .where(eq(subscriptionsTable.id, currentSubscription.id));
    await tx.insert(activityTable).values({
      merchantId: merchant.id,
      type: "bank_transfer_submitted",
      title: "Bank transfer submitted",
      description: `Transfer ${reference} is waiting for admin review.`,
      amount: amount.toFixed(2),
      currency: merchant.currency,
      tone: "neutral",
    });
    return created;
    });
    res
      .status(201)
      .json(
        SubmitBankTransferResponse.parse(
          serializePayment(payment, merchant.name),
        ),
      );
  } catch (error) {
    res.status(409).json({
      error:
        error instanceof Error
          ? error.message
          : "Transfer reference could not be submitted",
    });
  }
});

router.get("/admin/overview", async (req, res): Promise<void> => {
  const identity = await requireAdmin(req, res);
  if (!identity) return;
  const adminMerchant = await getOrCreateMerchant(identity);
  const merchants = await db.select().from(merchantsTable);
  const subs = await db.select().from(subscriptionsTable);
  const payments = await db
    .select({
      payment: paymentsTable,
      merchantName: merchantsTable.name,
    })
    .from(paymentsTable)
    .innerJoin(merchantsTable, eq(paymentsTable.merchantId, merchantsTable.id))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(20);
  const confirmedPayments = await db
    .select({ amount: paymentsTable.amount })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.status, "confirmed"),
        eq(paymentsTable.currency, adminMerchant.currency),
      ),
    );
  const nonAdminMerchants = merchants.filter(
    (merchant) => merchant.clerkUserId !== identity.clerkUserId,
  );
  const subscriptionByMerchant = new Map(
    subs.map((subscription) => [subscription.merchantId, subscription]),
  );
  const confirmedRevenue = confirmedPayments.reduce(
    (sum, payment) => sum + toNumber(payment.amount),
    0,
  );
  const [adminWithdrawalReserve] = await db
    .select({
      total: sql<string>`coalesce(sum(${withdrawalsTable.amount}) filter (where ${withdrawalsTable.status} in ('pending', 'approved', 'paid')), 0)`,
    })
    .from(withdrawalsTable)
    .where(
      and(
        eq(withdrawalsTable.merchantId, adminMerchant.id),
        eq(withdrawalsTable.currency, adminMerchant.currency),
      ),
    );
  res.json(
    GetAdminOverviewResponse.parse({
      currency: adminMerchant.currency,
      platformRevenue: confirmedRevenue,
      subscriptionRevenue: confirmedRevenue,
      availableBalance: Math.max(
        0,
        confirmedRevenue - toNumber(adminWithdrawalReserve?.total),
      ),
      withdrawalReserved: toNumber(adminWithdrawalReserve?.total),
      heldMerchantRevenue: subs.reduce(
        (sum, sub) => sum + toNumber(sub.earningsHeld),
        0,
      ),
      activeMerchants: nonAdminMerchants.filter(
        (merchant) => merchant.status === "active",
      ).length,
      attentionRequired: nonAdminMerchants.filter(
        (merchant) => {
          const subscription = subscriptionByMerchant.get(merchant.id);
          const outstanding = Math.max(
            0,
            toNumber(subscription?.amountDue) -
              toNumber(subscription?.amountPaid),
          );
          return (
            outstanding > 0 &&
            (daysSince(merchant.registeredAt) >= 10 ||
              merchant.status === "suspended")
          );
        },
      ).length,
      suspendedAccounts: nonAdminMerchants.filter(
        (merchant) => merchant.status === "suspended",
      ).length,
      recentPayments: payments.map(({ payment, merchantName }) =>
        serializePayment(payment, merchantName),
      ),
    }),
  );
});

router.get("/admin/merchants", async (req, res): Promise<void> => {
  const identity = await requireAdmin(req, res);
  if (!identity) return;
  const merchants = await db
    .select()
    .from(merchantsTable)
    .orderBy(desc(merchantsTable.registeredAt));
  const rows = await Promise.all(
    merchants.map(async (merchant) => {
      const isVerifiedAdminMerchant =
        identity.isAdmin &&
        merchant.clerkUserId === identity.clerkUserId;
      const enforced = await enforceSubscription(
        merchant,
        isVerifiedAdminMerchant,
      );
      return {
        id: enforced.merchant.id,
        name: enforced.merchant.name,
        email: enforced.merchant.email,
        storeName: enforced.merchant.storeName,
        status: enforced.merchant.status,
        subscriptionStatus:
          isVerifiedAdminMerchant
            ? "active"
            : enforced.subscription.status,
        amountPaid: toNumber(enforced.subscription.amountPaid),
        amountDue:
          isVerifiedAdminMerchant
            ? 0
            : toNumber(enforced.subscription.amountDue),
        earningsHeld: toNumber(enforced.subscription.earningsHeld),
        registeredAt: enforced.merchant.registeredAt,
        daysSinceRegistration: daysSince(enforced.merchant.registeredAt),
      };
    }),
  );
  res.json(ListMerchantsResponse.parse(rows));
});

router.patch("/admin/merchants/:id/status", async (req, res): Promise<void> => {
  const identity = await requireAdmin(req, res);
  if (!identity) return;
  const params = UpdateMerchantStatusParams.safeParse(req.params);
  const body = UpdateMerchantStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid merchant status update" });
    return;
  }
  const existing = (
    await db
      .select()
      .from(merchantsTable)
      .where(eq(merchantsTable.id, params.data.id))
      .limit(1)
  )[0];
  if (!existing) {
    res.status(404).json({ error: "Merchant not found" });
    return;
  }
  if (
    identity.isAdmin &&
    existing.clerkUserId === identity.clerkUserId
  ) {
    res.status(403).json({ error: "The master admin account cannot be suspended" });
    return;
  }
  const [merchant] = await db
    .update(merchantsTable)
    .set({ status: body.data.status })
    .where(eq(merchantsTable.id, existing.id))
    .returning();
  await addActivity(merchant.id, {
    type: "admin_status_change",
    title: `Account ${body.data.status}`,
    description: `The master admin changed account access to ${body.data.status}.`,
    tone: body.data.status === "active" ? "positive" : "warning",
  });
  const subscription = await getSubscriptionForMerchant(merchant);
  res.json(
    UpdateMerchantStatusResponse.parse({
      id: merchant.id,
      name: merchant.name,
      email: merchant.email,
      storeName: merchant.storeName,
      status: merchant.status,
      subscriptionStatus: subscription.status,
      amountPaid: toNumber(subscription.amountPaid),
      amountDue: toNumber(subscription.amountDue),
      earningsHeld: toNumber(subscription.earningsHeld),
      registeredAt: merchant.registeredAt,
      daysSinceRegistration: daysSince(merchant.registeredAt),
    }),
  );
});

router.patch("/admin/payments/:id/review", async (req, res): Promise<void> => {
  const identity = await requireAdmin(req, res);
  if (!identity) return;
  const params = ReviewBankTransferParams.safeParse(req.params);
  const body = ReviewBankTransferBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid payment review" });
    return;
  }

  const existing = (
    await db
      .select({ payment: paymentsTable, merchant: merchantsTable })
      .from(paymentsTable)
      .innerJoin(merchantsTable, eq(paymentsTable.merchantId, merchantsTable.id))
      .where(eq(paymentsTable.id, params.data.id))
      .limit(1)
  )[0];
  if (!existing) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  if (existing.payment.method !== "bank_transfer") {
    res.status(409).json({ error: "Only pending bank transfers can be reviewed" });
    return;
  }
  if (existing.payment.status === body.data.status) {
    res.json(
      ReviewBankTransferResponse.parse(
        serializePayment(existing.payment, existing.merchant.name),
      ),
    );
    return;
  }
  if (existing.payment.status !== "under_review") {
    res.status(409).json({ error: "This transfer already has a final review" });
    return;
  }

  try {
    const reviewed = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from ${subscriptionsTable} where ${subscriptionsTable.merchantId} = ${existing.merchant.id} for update`,
      );
      const currentPayment = (
        await tx
          .select()
          .from(paymentsTable)
          .where(eq(paymentsTable.id, existing.payment.id))
          .limit(1)
      )[0];
      if (!currentPayment) throw new Error("Payment not found");
      if (currentPayment.status === body.data.status) return currentPayment;
      if (currentPayment.status !== "under_review") {
        throw new Error("This transfer already has a final review");
      }

      const subscription = (
        await tx
          .select()
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.merchantId, existing.merchant.id))
          .limit(1)
      )[0];
      if (!subscription) throw new Error("Subscription not found");

      if (body.data.status === "confirmed") {
        const outstanding = Math.max(
          0,
          toNumber(subscription.amountDue) -
            toNumber(subscription.amountPaid),
        );
        const paymentAmount = toNumber(currentPayment.amount);
        if (outstanding === 0) {
          throw new Error(
            "The subscription is already settled; this transfer was not confirmed",
          );
        }
        if (paymentAmount > outstanding) {
          throw new Error(
            "The transfer exceeds the current outstanding balance and needs manual reconciliation",
          );
        }
      }

      const [payment] = await tx
        .update(paymentsTable)
        .set({
          status: body.data.status,
          reviewedBy: identity.clerkUserId,
          reviewNote: body.data.note?.trim() || null,
          reviewedAt: new Date(),
        })
        .where(
          and(
            eq(paymentsTable.id, existing.payment.id),
            eq(paymentsTable.status, "under_review"),
          ),
        )
        .returning();
      if (!payment) throw new Error("Payment was already reviewed");

      if (body.data.status === "confirmed") {
        const amountPaid =
          toNumber(subscription.amountPaid) + toNumber(payment.amount);
        const settled = amountPaid >= toNumber(subscription.amountDue);
        const remainingAfterPayment = Math.max(
          0,
          toNumber(subscription.amountDue) - amountPaid,
        );
        const earningsHeldAfterPayment = Math.min(
          toNumber(subscription.earningsHeld),
          remainingAfterPayment,
        );
        await tx
          .update(subscriptionsTable)
          .set({
            amountPaid: amountPaid.toFixed(2),
            earningsHeld: earningsHeldAfterPayment.toFixed(2),
            paymentMethod: "bank",
            status: settled ? "active" : "past_due",
          })
          .where(eq(subscriptionsTable.id, subscription.id));
        if (settled && existing.merchant.status !== "banned") {
          await tx
            .update(merchantsTable)
            .set({ status: "active" })
            .where(eq(merchantsTable.id, existing.merchant.id));
        }
      }

      await tx.insert(activityTable).values({
        merchantId: existing.merchant.id,
        type: "bank_transfer_reviewed",
        title:
          body.data.status === "confirmed"
            ? "Bank transfer approved"
            : "Bank transfer rejected",
        description:
          body.data.note?.trim() ||
          (body.data.status === "confirmed"
            ? "Your bank transfer was verified and applied to the platform fee."
            : "Your bank transfer could not be verified. Submit a valid reference to try again."),
        amount: payment.amount,
        tone: body.data.status === "confirmed" ? "positive" : "negative",
      });
      return payment;
    });
    res.json(
      ReviewBankTransferResponse.parse(
        serializePayment(reviewed, existing.merchant.name),
      ),
    );
  } catch (error) {
    res
      .status(409)
      .json({ error: error instanceof Error ? error.message : "Review failed" });
  }
});

router.get("/admin/withdrawals", async (req, res): Promise<void> => {
  const identity = await requireAdmin(req, res);
  if (!identity) return;
  const rows = await db
    .select({
      withdrawal: withdrawalsTable,
      merchantName: merchantsTable.name,
      merchantEmail: merchantsTable.email,
    })
    .from(withdrawalsTable)
    .innerJoin(merchantsTable, eq(withdrawalsTable.merchantId, merchantsTable.id))
    .orderBy(desc(withdrawalsTable.createdAt))
    .limit(100);
  res.json(
    ListAdminWithdrawalsResponse.parse(
      rows.map(({ withdrawal, merchantName, merchantEmail }) => ({
        ...serializeWithdrawal(withdrawal),
        merchantName,
        merchantEmail,
      })),
    ),
  );
});

router.patch("/admin/withdrawals/:id/review", async (req, res): Promise<void> => {
  const identity = await requireAdmin(req, res);
  if (!identity) return;
  const params = ReviewWithdrawalParams.safeParse(req.params);
  const parsed = ReviewWithdrawalBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Status, authenticator code, and confirmation are required" });
    return;
  }
  const expectedConfirmation = `${parsed.data.status.toUpperCase()} WITHDRAWAL ${params.data.id}`;
  if (
    !(await requireAdminWithdrawalSecurity(
      req,
      res,
      identity,
      parsed.data.securityCode,
      parsed.data.pinCodes,
      parsed.data.confirmation,
      expectedConfirmation,
    ))
  ) {
    return;
  }
  const existing = (
    await db
      .select({
        withdrawal: withdrawalsTable,
        merchantName: merchantsTable.name,
        merchantEmail: merchantsTable.email,
      })
      .from(withdrawalsTable)
      .innerJoin(merchantsTable, eq(withdrawalsTable.merchantId, merchantsTable.id))
      .where(eq(withdrawalsTable.id, params.data.id))
      .limit(1)
  )[0];
  if (!existing) {
    res.status(404).json({ error: "Withdrawal not found" });
    return;
  }
  try {
    const reviewed = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from ${withdrawalsTable} where ${withdrawalsTable.id} = ${existing.withdrawal.id} for update`,
      );
      const current = (
        await tx
          .select()
          .from(withdrawalsTable)
          .where(eq(withdrawalsTable.id, existing.withdrawal.id))
          .limit(1)
      )[0];
      if (!current) throw new Error("Withdrawal not found");
      if (current.status === parsed.data.status) return current;
      const validTransition =
        (parsed.data.status === "approved" && current.status === "pending") ||
        (parsed.data.status === "rejected" &&
          (current.status === "pending" || current.status === "approved")) ||
        (parsed.data.status === "paid" && current.status === "approved");
      if (!validTransition) {
        throw new Error(`Cannot move a ${current.status} withdrawal to ${parsed.data.status}`);
      }
      const [updated] = await tx
        .update(withdrawalsTable)
        .set({
          status: parsed.data.status,
          reviewedBy: identity.clerkUserId,
          reviewNote: parsed.data.note?.trim() || null,
          reviewedAt: new Date(),
          paidAt: parsed.data.status === "paid" ? new Date() : current.paidAt,
        })
        .where(
          and(
            eq(withdrawalsTable.id, current.id),
            eq(withdrawalsTable.status, current.status),
          ),
        )
        .returning();
      if (!updated) throw new Error("Withdrawal was already updated");
      await tx.insert(activityTable).values({
        merchantId: current.merchantId,
        type: "withdrawal_reviewed",
        title:
          parsed.data.status === "paid"
            ? "Withdrawal marked paid"
            : `Withdrawal ${parsed.data.status}`,
        description:
          parsed.data.note?.trim() ||
          (parsed.data.status === "approved"
            ? "Your withdrawal was approved for manual payout."
            : parsed.data.status === "paid"
              ? "Your withdrawal was marked paid after manual transfer."
              : "Your withdrawal request was rejected."),
        amount: current.amount,
        currency: current.currency,
        tone: parsed.data.status === "rejected" ? "negative" : "positive",
      });
      return updated;
    });
    res.json(
      ReviewWithdrawalResponse.parse({
        ...serializeWithdrawal(reviewed),
        merchantName: existing.merchantName,
        merchantEmail: existing.merchantEmail,
      }),
    );
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : "Withdrawal review failed",
    });
  }
});

router.post("/admin/withdrawals/:id/details", async (req, res): Promise<void> => {
  const identity = await requireAdmin(req, res);
  if (!identity) return;
  const params = RevealWithdrawalDetailsParams.safeParse(req.params);
  const parsed = RevealWithdrawalDetailsBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Authenticator code and confirmation are required" });
    return;
  }
  if (
    !(await requireAdminWithdrawalSecurity(
      req,
      res,
      identity,
      parsed.data.securityCode,
      parsed.data.pinCodes,
      parsed.data.confirmation,
      `VIEW WITHDRAWAL ${params.data.id}`,
    ))
  ) {
    return;
  }
  const withdrawal = (
    await db
      .select()
      .from(withdrawalsTable)
      .where(eq(withdrawalsTable.id, params.data.id))
      .limit(1)
  )[0];
  if (!withdrawal) {
    res.status(404).json({ error: "Withdrawal not found" });
    return;
  }
  try {
    const destination = JSON.parse(decryptSecret(withdrawal.destinationCiphertext)) as {
      bankCode: string;
      accountNumber: string;
    };
    res.json(
      RevealWithdrawalDetailsResponse.parse({
        id: withdrawal.id,
        beneficiaryName: withdrawal.beneficiaryName,
        bankName: withdrawal.bankName,
        bankCode: destination.bankCode,
        accountNumber: destination.accountNumber,
      }),
    );
  } catch {
    res.status(500).json({ error: "Withdrawal destination could not be decrypted" });
  }
});

/* Authoritative accounting endpoints. Legacy order status cannot create revenue. */
router.post("/payments", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const body = CreatePaymentIntentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid payment intent" }); return; }
  const merchant = await getOrCreateMerchant(identity);
  const header = CreatePaymentIntentHeader.safeParse(req.headers);
  const key = (header.success ? header.data["Idempotency-Key"] : undefined) ?? body.data.idempotencyKey ?? `order:${body.data.orderId}`;
  try {
    const intent = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from ${ordersTable} where id=${body.data.orderId} and merchant_id=${merchant.id} for update`);
      const order = (await tx.select().from(ordersTable).where(and(eq(ordersTable.id, body.data.orderId), eq(ordersTable.merchantId, merchant.id))).limit(1))[0];
      if (!order) throw new Error("Order not found");
      if (order.currency !== body.data.currency.toUpperCase()) throw new Error("Payment currency does not match order");
      const old = (await tx.select().from(paymentIntentsTable).where(and(eq(paymentIntentsTable.merchantId, merchant.id), eq(paymentIntentsTable.idempotencyKey, key))).limit(1))[0];
      if (old) return old;
      const [created] = await tx.insert(paymentIntentsTable).values({ merchantId: merchant.id, orderId: order.id, amountMinor: Math.round(Number(order.total) * 100), currency: order.currency, method: body.data.method, evidenceReference: body.data.evidenceReference ?? null, idempotencyKey: key, status: body.data.evidenceReference ? "submitted" : "created" }).returning();
      if (!created) throw new Error("Payment intent could not be created");
      await tx.insert(paymentRecordsTable).values({ intentId: created.id, merchantId: merchant.id, orderId: order.id, amountMinor: created.amountMinor, currency: order.currency, method: created.method, evidenceReference: created.evidenceReference, status: created.status });
      return created;
    });
    res.status(201).json(CreatePaymentIntentResponse.parse(intent));
  } catch (error) { req.log.error({ err: error }, "payment intent creation failed"); res.status(409).json({ error: error instanceof Error ? error.message : "Payment intent failed" }); }
});

router.post("/payments/:id/verify", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const body = VerifyPaymentBody.safeParse(req.body ?? {}); const id = Number(req.params.id);
  if (!body.success || !Number.isInteger(id)) { res.status(400).json({ error: "Invalid verification" }); return; }
  const merchant = await getOrCreateMerchant(identity);
  try {
    const intent = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from ${paymentIntentsTable} where id=${id} and merchant_id=${merchant.id} for update`);
      const current = (await tx.select().from(paymentIntentsTable).where(and(eq(paymentIntentsTable.id, id), eq(paymentIntentsTable.merchantId, merchant.id))).limit(1))[0];
      if (!current) throw new Error("Payment intent not found");
       if (current.status === "verified") return current;
      if (!["created", "submitted"].includes(current.status)) throw new Error("Payment is not awaiting verification");
      const evidence = body.data.evidenceReference ?? current.evidenceReference;
      if (!evidence) throw new Error("Evidence/reference is required");
      const payment = (await tx.select({ id: paymentRecordsTable.id }).from(paymentRecordsTable).where(eq(paymentRecordsTable.intentId, id)).limit(1))[0];
      if (!payment) throw new Error("Payment record not found");
       const order = (await tx.select().from(ordersTable).where(and(eq(ordersTable.id, current.orderId), eq(ordersTable.merchantId, merchant.id))).limit(1))[0];
       if (!order) throw new Error("Order not found");
       if (order.supplierProductId) {
         await tx.execute(sql`select id from ${supplierProductsTable} where id=${order.supplierProductId} and merchant_id=${merchant.id} for update`);
         await tx.execute(sql`select id from ${inventoryReservationsTable} where order_id=${order.id} and merchant_id=${merchant.id} for update`);
         const reservation = (await tx.select().from(inventoryReservationsTable).where(and(eq(inventoryReservationsTable.orderId, order.id), eq(inventoryReservationsTable.merchantId, merchant.id), eq(inventoryReservationsTable.supplierProductId, order.supplierProductId))).limit(1))[0];
         const product = (await tx.select().from(supplierProductsTable).where(and(eq(supplierProductsTable.id, order.supplierProductId), eq(supplierProductsTable.merchantId, merchant.id))).limit(1))[0];
         if (reservation?.status === "reserved" && reservation.expiresAt <= new Date()) {
           await tx.update(inventoryReservationsTable).set({ status: "expired", updatedAt: new Date() }).where(eq(inventoryReservationsTable.id, reservation.id));
           throw new Error("Inventory reservation has expired");
         }
         if (product?.inventoryStrategy !== "source_based" && product.availabilityQuantity !== null && (!reservation || reservation.status !== "reserved")) throw new Error("Inventory reservation is missing or no longer active");
         if (reservation?.status === "reserved") {
           await tx.update(inventoryReservationsTable).set({ status: "consumed", updatedAt: new Date() }).where(and(eq(inventoryReservationsTable.id, reservation.id), eq(inventoryReservationsTable.status, "reserved")));
            if (product?.inventoryStrategy !== "source_based" && product.availabilityQuantity !== null) {
             const [updatedProduct] = await tx.update(supplierProductsTable)
               .set({ availabilityQuantity: sql`${supplierProductsTable.availabilityQuantity} - ${reservation.quantity}` })
               .where(and(eq(supplierProductsTable.id, product.id), eq(supplierProductsTable.merchantId, merchant.id), sql`${supplierProductsTable.availabilityQuantity} >= ${reservation.quantity}`))
               .returning();
              if (!updatedProduct) throw new Error("Inventory changed before payment verification");
           }
           await tx.insert(inventoryMovementsTable).values({ merchantId: merchant.id, supplierProductId: reservation.supplierProductId, orderId: order.id, quantityDelta: -reservation.quantity, reason: "sale", referenceKey: `sale:${id}` }).onConflictDoNothing({ target: inventoryMovementsTable.referenceKey });
         }
       }
      const [updated] = await tx.update(paymentIntentsTable).set({ status: "verified", evidenceReference: evidence }).where(eq(paymentIntentsTable.id, id)).returning();
      await tx.update(paymentRecordsTable).set({ status: "verified", evidenceReference: evidence, verifiedBy: identity.clerkUserId, verifiedAt: new Date() }).where(eq(paymentRecordsTable.id, payment.id));
      await tx.insert(ledgerEntriesTable).values({ merchantId: merchant.id, orderId: current.orderId, paymentRecordId: payment.id, amountMinor: current.amountMinor, currency: current.currency, entryType: "sale", referenceKey: `payment:${id}` });
      await tx.execute(sql`select id from ${subscriptionsTable} where merchant_id=${merchant.id} for update`);
      const subscription = (await tx.select().from(subscriptionsTable).where(eq(subscriptionsTable.merchantId, merchant.id)).limit(1))[0];
      if (subscription) {
        const outstanding = Math.max(0, toNumber(subscription.amountDue) - toNumber(subscription.amountPaid));
        const availableToHold = Math.max(0, outstanding - toNumber(subscription.earningsHeld));
        const holdAmount = Math.min(Number(current.amountMinor) / 100, availableToHold);
        if (holdAmount > 0) {
          const [heldSubscription] = await tx.update(subscriptionsTable).set({
            earningsHeld: (toNumber(subscription.earningsHeld) + holdAmount).toFixed(2),
          }).where(and(
            eq(subscriptionsTable.id, subscription.id),
            eq(subscriptionsTable.amountPaid, subscription.amountPaid),
            eq(subscriptionsTable.earningsHeld, subscription.earningsHeld),
          )).returning();
          if (!heldSubscription) throw new Error("Subscription changed while sale was being verified");
        }
      }
      await tx.update(ordersTable).set({ status: "paid" }).where(and(eq(ordersTable.id, current.orderId), eq(ordersTable.merchantId, merchant.id)));
      await tx.insert(commerceTransitionHistoryTable).values({ merchantId: merchant.id, orderId: current.orderId, paymentIntentId: id, entityType: "payment_intent", fromStatus: current.status, toStatus: "verified", actorId: identity.clerkUserId, note: body.data.note ?? null });
      return updated;
    });
    res.json(VerifyPaymentResponse.parse(intent));
  } catch (error) { req.log.error({ err: error }, "payment verification failed"); res.status(409).json({ error: error instanceof Error ? error.message : "Payment verification failed" }); }
});

router.get("/balances", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return; const merchant = await getOrCreateMerchant(identity);
  const rows = await db.select({ currency: ledgerEntriesTable.currency, balance: sql<string>`coalesce(sum(${ledgerEntriesTable.amountMinor}),0)` }).from(ledgerEntriesTable).where(eq(ledgerEntriesTable.merchantId, merchant.id)).groupBy(ledgerEntriesTable.currency);
  res.json(GetMerchantBalancesResponse.parse(rows.map((r) => ({ currency: r.currency, ledgerBalanceMinor: Number(r.balance), availableBalanceMinor: Number(r.balance), heldBalanceMinor: 0 }))));
});

router.post("/refunds", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return; const body = CreateRefundBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid refund" }); return; } const merchant = await getOrCreateMerchant(identity);
  try {
    const refund = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from ${ordersTable} where id=${body.data.orderId} and merchant_id=${merchant.id} for update`);
      const order = (await tx.select().from(ordersTable).where(and(eq(ordersTable.id, body.data.orderId), eq(ordersTable.merchantId, merchant.id))).limit(1))[0];
      const intent = order && (await tx.select().from(paymentIntentsTable).where(eq(paymentIntentsTable.orderId, order.id)).limit(1))[0];
      if (!order || !intent || intent.status !== "verified") throw new Error("Only verified orders can be refunded");
      const payment = (await tx.select({ id: paymentRecordsTable.id }).from(paymentRecordsTable).where(eq(paymentRecordsTable.intentId, intent.id)).limit(1))[0]; if (!payment) throw new Error("Payment record not found");
      const previous = await tx.select({ total: sql<string>`coalesce(sum(${refundRecordsTable.amountMinor}),0)` }).from(refundRecordsTable).where(and(eq(refundRecordsTable.paymentRecordId, payment.id), inArray(refundRecordsTable.status, ["requested", "approved", "processed"])));
      if (body.data.amountMinor + Number(previous[0]?.total ?? 0) > intent.amountMinor) throw new Error("Refund exceeds verified payment");
       if (body.data.inventoryRestock && body.data.amountMinor !== intent.amountMinor) throw new Error("Inventory restock requires a full refund");
      const [created] = await tx.insert(refundRecordsTable).values({ merchantId: merchant.id, orderId: order.id, paymentRecordId: payment.id, amountMinor: body.data.amountMinor, currency: intent.currency, reason: body.data.reason, inventoryRestock: body.data.inventoryRestock ?? false, requestedBy: identity.clerkUserId }).returning();
      if (!created) throw new Error("Refund could not be created"); return created;
    });
    res.status(201).json(CreateRefundResponse.parse(refund));
  } catch (error) { req.log.error({ err: error }, "refund creation failed"); res.status(409).json({ error: error instanceof Error ? error.message : "Refund failed" }); }
});

router.post("/refunds/:id/approve", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return; const id = Number(req.params.id); const merchant = await getOrCreateMerchant(identity);
  try {
    const refund = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from ${refundRecordsTable} where id=${id} and merchant_id=${merchant.id} for update`);
      const current = (await tx.select().from(refundRecordsTable).where(and(eq(refundRecordsTable.id, id), eq(refundRecordsTable.merchantId, merchant.id))).limit(1))[0];
       if (!current) throw new Error("Refund not found");
       if (current.status === "processed") return current;
       if (current.status !== "requested") throw new Error("Refund is not awaiting approval");
      await tx.execute(sql`select id from ${ordersTable} where id=${current.orderId} and merchant_id=${merchant.id} for update`);
      const order = (await tx.select().from(ordersTable).where(eq(ordersTable.id, current.orderId)).limit(1))[0];
      const [updated] = await tx.update(refundRecordsTable).set({ status: "processed", approvedBy: identity.clerkUserId, approvedAt: new Date() }).where(eq(refundRecordsTable.id, id)).returning();
      await tx.insert(ledgerEntriesTable).values({ merchantId: merchant.id, orderId: current.orderId, paymentRecordId: current.paymentRecordId, refundId: id, amountMinor: -current.amountMinor, currency: current.currency, entryType: "refund", referenceKey: `refund:${id}` });
      if (current.inventoryRestock && order?.supplierProductId) {
        await tx.execute(sql`select id from ${supplierProductsTable} where id=${order.supplierProductId} and merchant_id=${merchant.id} for update`);
         await tx.execute(sql`select id from ${inventoryReservationsTable} where order_id=${order.id} and merchant_id=${merchant.id} for update`);
         const reservation = (await tx.select().from(inventoryReservationsTable).where(and(eq(inventoryReservationsTable.orderId, order.id), eq(inventoryReservationsTable.merchantId, merchant.id), eq(inventoryReservationsTable.supplierProductId, order.supplierProductId))).limit(1))[0];
          if (reservation && reservation.status !== "consumed") throw new Error("Only consumed inventory can be restocked");
         const [movement] = await tx.insert(inventoryMovementsTable).values({ merchantId: merchant.id, supplierProductId: order.supplierProductId, orderId: order.id, quantityDelta: order.quantity, reason: "refund_restock", referenceKey: `restock:refund:${id}` }).onConflictDoNothing({ target: inventoryMovementsTable.referenceKey }).returning();
         if (movement) {
           await tx.update(supplierProductsTable).set({ availabilityQuantity: sql`${supplierProductsTable.availabilityQuantity} + ${reservation?.quantity ?? order.quantity}` }).where(and(eq(supplierProductsTable.id, order.supplierProductId), eq(supplierProductsTable.merchantId, merchant.id), sql`${supplierProductsTable.availabilityQuantity} is not null`));
         }
      }
      const refunded = await tx.select({ total: sql<string>`coalesce(sum(${refundRecordsTable.amountMinor}),0)` }).from(refundRecordsTable).where(and(eq(refundRecordsTable.paymentRecordId, current.paymentRecordId), inArray(refundRecordsTable.status, ["approved", "processed"])));
      const payment = (await tx.select().from(paymentRecordsTable).where(eq(paymentRecordsTable.id, current.paymentRecordId)).limit(1))[0];
      if (payment) {
        const paymentStatus = Number(refunded[0]?.total ?? 0) >= payment.amountMinor ? "refunded" : "partially_refunded";
        await tx.update(paymentRecordsTable).set({ status: paymentStatus }).where(eq(paymentRecordsTable.id, payment.id));
        await tx.update(paymentIntentsTable).set({ status: paymentStatus }).where(eq(paymentIntentsTable.id, payment.intentId));
      }
      await tx.insert(commerceTransitionHistoryTable).values({ merchantId: merchant.id, orderId: current.orderId, refundId: id, entityType: "refund", fromStatus: "requested", toStatus: "processed", actorId: identity.clerkUserId });
      return updated;
    }); res.json(ApproveRefundResponse.parse(refund));
  } catch (error) { req.log.error({ err: error }, "refund approval failed"); res.status(409).json({ error: error instanceof Error ? error.message : "Refund failed" }); }
});

router.get("/inventory/reservations", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const rows = await db.select().from(inventoryReservationsTable)
    .where(eq(inventoryReservationsTable.merchantId, merchant.id))
    .orderBy(desc(inventoryReservationsTable.createdAt)).limit(500);
  res.json(ListInventoryReservationsResponse.parse(rows));
});

router.get("/inventory/movements", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const rows = await db.select().from(inventoryMovementsTable)
    .where(eq(inventoryMovementsTable.merchantId, merchant.id))
    .orderBy(desc(inventoryMovementsTable.createdAt)).limit(500);
  res.json(ListInventoryMovementsResponse.parse(rows));
});

router.post("/inventory/adjustments", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const body = CreateInventoryAdjustmentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid inventory adjustment" }); return; }
  const merchant = await getOrCreateMerchant(identity);
  try {
    const movement = await db.transaction(async (tx) => {
      const prior = (await tx.select().from(inventoryMovementsTable).where(and(eq(inventoryMovementsTable.merchantId, merchant.id), eq(inventoryMovementsTable.referenceKey, body.data.referenceKey))).limit(1))[0];
      if (prior) return prior;
      await tx.execute(sql`select id from ${supplierProductsTable} where id=${body.data.supplierProductId} and merchant_id=${merchant.id} for update`);
      const product = (await tx.select().from(supplierProductsTable).where(and(eq(supplierProductsTable.id, body.data.supplierProductId), eq(supplierProductsTable.merchantId, merchant.id))).limit(1))[0];
      if (!product) throw new Error("Product not found");
      if (product.inventoryStrategy === "source_based" || product.availabilityQuantity === null) throw new Error("Product inventory is source-based or unknown");
       const [reserved] = await tx.select({
         quantity: sql<string>`coalesce(sum(${inventoryReservationsTable.quantity}), 0)`,
       }).from(inventoryReservationsTable).where(and(
         eq(inventoryReservationsTable.merchantId, merchant.id),
         eq(inventoryReservationsTable.supplierProductId, product.id),
         eq(inventoryReservationsTable.status, "reserved"),
         gte(inventoryReservationsTable.expiresAt, new Date()),
       ));
       const activeReserved = Number(reserved?.quantity ?? 0);
       if (product.availabilityQuantity + body.data.quantityDelta < activeReserved) throw new Error("Adjustment would undercut active reservations");
      const [created] = await tx.insert(inventoryMovementsTable).values({ merchantId: merchant.id, supplierProductId: product.id, quantityDelta: body.data.quantityDelta, reason: body.data.reason.trim(), referenceKey: body.data.referenceKey.trim() }).returning();
      if (!created) throw new Error("Adjustment could not be recorded");
      await tx.update(supplierProductsTable).set({ availabilityQuantity: product.availabilityQuantity + body.data.quantityDelta }).where(and(eq(supplierProductsTable.id, product.id), eq(supplierProductsTable.merchantId, merchant.id)));
      return created;
    });
    res.status(201).json(CreateInventoryAdjustmentResponse.parse(movement));
  } catch (error) {
    req.log.error({ err: error }, "inventory adjustment failed");
    res.status(409).json({ error: error instanceof Error ? error.message : "Inventory adjustment failed" });
  }
});

router.post("/reconciliation", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return; const body = CreateReconciliationBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid reconciliation" }); return; } const merchant = await getOrCreateMerchant(identity);
  const [record] = await db.insert(reconciliationRecordsTable).values({ merchantId: merchant.id, currency: body.data.currency.toUpperCase(), expectedMinor: body.data.expectedMinor, observedMinor: body.data.observedMinor, discrepancyMinor: body.data.observedMinor - body.data.expectedMinor, note: body.data.note ?? null, createdBy: identity.clerkUserId }).returning();
  res.status(201).json(CreateReconciliationResponse.parse(record));
});
router.get("/reconciliation", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return; const merchant = await getOrCreateMerchant(identity);
  const records = await db.select().from(reconciliationRecordsTable).where(eq(reconciliationRecordsTable.merchantId, merchant.id)).orderBy(desc(reconciliationRecordsTable.createdAt));
  res.json(ListReconciliationsResponse.parse(records));
});
router.patch("/reconciliation/:id", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const body = UpdateReconciliationBody.safeParse(req.body); const id = Number(req.params.id);
  if (!body.success || !Number.isInteger(id)) { res.status(400).json({ error: "Invalid reconciliation update" }); return; }
  const merchant = await getOrCreateMerchant(identity);
  const [record] = await db.update(reconciliationRecordsTable).set({ status: body.data.status, note: body.data.note ?? null, ...(body.data.status === "resolved" ? { resolvedBy: identity.clerkUserId, resolvedAt: new Date() } : {}) }).where(and(eq(reconciliationRecordsTable.id, id), eq(reconciliationRecordsTable.merchantId, merchant.id))).returning();
  if (!record) { res.status(404).json({ error: "Reconciliation record not found" }); return; }
  res.json(UpdateReconciliationResponse.parse(record));
});

export default router;