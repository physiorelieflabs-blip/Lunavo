import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  and,
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
  customersTable,
  db,
  merchantBankAccountsTable,
  merchantsTable,
  ordersTable,
  paymentsTable,
  supplierProductsTable,
  supplierImportAttemptsTable,
  supplierImportBatchesTable,
  suppliersTable,
  subscriptionsTable,
  withdrawalSecurityTable,
  withdrawalsTable,
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
  CreateSubscriptionBody,
  CreateSubscriptionResponse,
  UpdateDropshipStatusBody,
  GetAdminOverviewResponse,
  GetDashboardOverviewResponse,
  GetCurrencySettingsResponse,
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
  ListSuppliersResponse,
  UpdateSupplierParams,
  UpdateSupplierBody,
  UpdateSupplierResponse,
  ListAdminWithdrawalsResponse,
  ListCustomersResponse,
  ListDashboardActivityResponse,
  ListDropshipQueueResponse,
  ListOrdersResponse,
  ListSupplierProductsResponse,
  ListWithdrawalsResponse,
  ListMerchantsResponse,
  PaySubscriptionFromEarningsResponse,
  CreateWithdrawalBody,
  CreateWithdrawalResponse,
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
  UpdateOrderStatusBody,
  UpdateOrderStatusParams,
  UpdateOrderStatusResponse,
  UpdateDropshipStatusParams,
  UpdateDropshipStatusResponse,
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

function daysSince(date: Date): number {
  return Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)),
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
  const days = daysSince(merchant.registeredAt);
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

async function requireAdminWithdrawalSecurity(
  req: Request,
  res: Response,
  identity: Identity,
  code: string,
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
    .where(eq(withdrawalsTable.merchantId, enforced.merchant.id));
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
      storeSlug: enforced.merchant.storeName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
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

  const amount = Number(parsed.data.amount.toFixed(2));
  const currency = (parsed.data.currency ?? merchant.currency).toUpperCase();
  if (currency !== merchant.currency) {
    res.status(400).json({
      error: `Withdrawal currency must match your dashboard currency (${merchant.currency})`,
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
      const [revenue] = await tx
        .select({
          total: sql<string>`coalesce(sum(${ordersTable.total}) filter (where ${ordersTable.status} in ('paid', 'fulfilled')), 0)`,
        })
        .from(ordersTable)
        .where(eq(ordersTable.merchantId, merchant.id));
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
        .where(eq(withdrawalsTable.merchantId, merchant.id));
      const available =
        toNumber(revenue?.total) -
        toNumber(subscription?.earningsHeld) -
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
        title: "Withdrawal request submitted",
        description: `A ${currency} withdrawal request is waiting for review.`,
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

router.post("/supplier-products", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
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
      const values = importedProductValues(imported, {
        supplierUrl: supplier.website,
        profitType: parsed.data.profitType,
        profitValue: parsed.data.profitValue,
        inventoryStrategy: parsed.data.inventoryStrategy,
        visibility: "draft",
      }, supplier.id);
      const [product] = await db
        .insert(supplierProductsTable)
        .values({ merchantId: merchant.id, ...values })
        .returning();
      if (!product) throw new Error("Product could not be saved");
      await db.insert(supplierImportAttemptsTable).values({
        merchantId: merchant.id,
        supplierProductId: product.id,
        batchId: batch.id,
        sourceUrl: imported.sourceUrl,
        status: "imported",
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

router.post("/supplier-products/:id/refresh", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
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
        orderCount: Number(orderCount),
        totalSpent: toNumber(totalSpent),
        createdAt: customer.createdAt,
      })),
    ),
  );
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
      const status = parsed.data.status ?? "paid";
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

      if (status === "paid" || status === "fulfilled") {
        const outstanding = Math.max(
          0,
          toNumber(subscription.amountDue) - toNumber(subscription.amountPaid),
        );
        const availableToHold = Math.max(
          0,
          outstanding - toNumber(subscription.earningsHeld),
        );
        const holdAmount = Math.min(parsed.data.total, availableToHold);
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
        await tx.insert(activityTable).values({
          merchantId: merchant.id,
          type: "order_cancelled",
          title: `Checkout ${order.orderNumber} cancelled`,
          description: "The customer checkout was cancelled before payment.",
          tone: "warning",
        });
        return { ...existing, order };
      }

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
        currency: product.currency,
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
        const quantity = parsed.data.quantity;
        const total = Number(
          (toNumber(product.sellingPrice) * quantity).toFixed(2),
        );
        const email = parsed.data.customerEmail.trim().toLowerCase();
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
    const [order] = await tx
      .update(ordersTable)
      .set({
        fulfillmentStatus: nextStatus,
         status: nextStatus === "delivered" ? "fulfilled" : existing.order.status,
      })
      .where(eq(ordersTable.id, existing.order.id))
      .returning();
    if (!order) throw new Error("Dropshipping status could not be updated");
    await tx.insert(activityTable).values({
      merchantId: merchant.id,
      type: "dropship_status_updated",
      title: `Order ${order.orderNumber} supplier status updated`,
      description: `Supplier handoff marked ${nextStatus.replaceAll("_", " ")}.`,
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
    .where(eq(paymentsTable.status, "confirmed"));
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
  res.json(
    GetAdminOverviewResponse.parse({
      platformRevenue: confirmedRevenue,
      subscriptionRevenue: confirmedRevenue,
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

export default router;