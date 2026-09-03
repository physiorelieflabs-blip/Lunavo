import {
  randomBytes,
  randomUUID,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  and,
  asc,
  desc,
  eq,
  exists,
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
  paymentLinksTable,
  marketplaceListingsTable,
  marketplaceBillingRecordsTable,
  advertisingPaymentsTable,
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
  invoicesTable,
  invoiceLinesTable,
  invoicePaymentSubmissionsTable,
  domainEventsTable,
  domainEventConsumptionsTable,
  notificationsTable,
  merchantLocationsTable,
  merchantRolesTable,
  merchantRolePermissionsTable,
  merchantMembershipsTable,
  merchantMembershipLocationsTable,
  merchantInvitationsTable,
  merchantInvitationLocationsTable,
  auctionListingsTable,
  auctionBidsTable,
} from "@workspace/db";
import {
  BeginWithdrawalSecuritySetupResponse,
  ConfirmWithdrawalSecuritySetupBody,
  ConfirmWithdrawalSecuritySetupResponse,
  CreateOrderBody,
  CreateOrderResponse,
  CreatePaymentLinkBody,
  CreatePaymentLinkResponse,
  ListPaymentLinksResponse,
  UpdatePaymentLinkBody,
  UpdatePaymentLinkParams,
  UpdatePaymentLinkResponse,
  GetPublicPaymentLinkParams,
  GetPublicPaymentLinkResponse,
  CreatePaymentLinkCheckoutBody,
  CreatePaymentLinkCheckoutParams,
  CreatePaymentLinkCheckoutResponse,
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
  GetMarketplaceManagementResponse,
  CreateMarketplaceListingBody,
  CreateMarketplaceListingResponse,
  UpdateMarketplaceListingParams,
  UpdateMarketplaceListingBody,
  UpdateMarketplaceListingResponse,
  SubmitMarketplaceBillingParams,
  SubmitMarketplaceBillingBody,
  SubmitMarketplaceBillingResponse,
  ReviewMarketplaceListingParams,
  ReviewMarketplaceListingBody,
  ReviewMarketplaceListingResponse,
  ReviewMarketplaceBillingParams,
  ReviewMarketplaceBillingBody,
  ReviewMarketplaceBillingResponse,
  ListMarketplaceAdminQueueResponse,
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
  SimulateAiScenarioBody,
  SimulateAiScenarioResponse,
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
  GetMarketingBillingResponse,
  PayAdvertisingFromEarningsResponse,
  SubmitAdvertisingPaymentReferenceBody,
  SubmitAdvertisingPaymentReferenceParams,
  SubmitAdvertisingPaymentReferenceResponse,
  ListAdminAdvertisingPaymentsResponse,
  ReviewAdvertisingPaymentParams,
  ReviewAdvertisingPaymentBody,
  ReviewAdvertisingPaymentResponse,
  ListAuctionsQueryParams,
  ListAuctionsResponse,
  CreateAuctionBody,
  CreateAuctionResponse,
  GetAuctionParams,
  GetAuctionResponse,
  PlaceAuctionBidParams,
  PlaceAuctionBidBody,
  PlaceAuctionBidResponse,
  ListMerchantAuctionsResponse,
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
  ListInvoicesResponse,
  CreateInvoiceBody,
  CreateInvoiceResponse,
  GetInvoiceParams,
  GetInvoiceResponse,
  SendInvoiceParams,
  SendInvoiceResponse,
  VoidInvoiceParams,
  VoidInvoiceResponse,
  VerifyInvoicePaymentParams,
  VerifyInvoicePaymentBody,
  VerifyInvoicePaymentResponse,
  GetPublicInvoiceParams,
  GetPublicInvoiceResponse,
  SubmitInvoicePaymentReferenceParams,
  SubmitInvoicePaymentReferenceBody,
  SubmitInvoicePaymentReferenceResponse,
  ListDomainEventsResponse,
  GetCustomerContextParams,
  GetCustomerContextResponse,
  GetOrderContextParams,
  GetOrderContextResponse,
  GetInvoiceContextParams,
  GetInvoiceContextResponse,
  ReplayDomainEventParams,
  ReplayDomainEventResponse,
  ListNotificationsResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
  GetTeamAccessResponse,
  ListAccessibleWorkspacesResponse,
  GetCurrentWorkspaceResponse,
  ListTeamLocationsResponse,
  CreateTeamLocationBody,
  CreateTeamLocationResponse,
  UpdateTeamLocationParams,
  UpdateTeamLocationBody,
  UpdateTeamLocationResponse,
  DisableTeamLocationParams,
  DisableTeamLocationResponse,
  SetDefaultTeamLocationParams,
  SetDefaultTeamLocationResponse,
  ListTeamRolesResponse,
  ListTeamMembershipsResponse,
  UpdateTeamMembershipParams,
  UpdateTeamMembershipBody,
  UpdateTeamMembershipResponse,
  DisableTeamMembershipParams,
  DisableTeamMembershipResponse,
  ListTeamInvitationsResponse,
  CreateTeamInvitationBody,
  CreateTeamInvitationResponse,
  RevokeTeamInvitationParams,
  RevokeTeamInvitationResponse,
  RotateTeamInvitationLinkParams,
  RotateTeamInvitationLinkResponse,
  GetPublicInvitationPreviewParams,
  GetPublicInvitationPreviewResponse,
  AcceptTeamInvitationBody,
  AcceptTeamInvitationResponse,
} from "@workspace/api-zod";
import {
  createTotpUri,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  verifyTotp,
} from "../lib/withdrawal-security";
import { emitDomainEvent } from "../lib/domain-events";
import { ensureTenantOwnerMembership, getTenantAccess, requireLocationScope, requirePermission, validateTenantLocations, type TenantAccess } from "../lib/tenant-access";
import {
  importPublicSupplierProduct,
  type ImportedSupplierProduct,
} from "../lib/public-supplier";
import { canonicalInvoiceLine, canonicalMoneyMinor, invoiceStatusForDueDate } from "../lib/invoice-logic";
import {
  allowedActionType,
  getAiActionForMerchant,
  getAiOverviewForMerchant,
  getAiSettingsForMerchant,
  listAiActionsForMerchant,
  serializeAiAction,
  trainMerchantAiModel,
  simulateMerchantScenario,
} from "../lib/ai";
import { calendarDaysSince, safeTimeZone } from "../lib/regional-time";
import {
  isWhopConfigured,
  whopCompanyId,
  whopPlanId,
  whopRequest,
  type WhopCheckoutConfiguration,
  type WhopPayment,
} from "../lib/whop-client";

const router: IRouter = Router();
class CommerceAuthorizationError extends Error {
  readonly statusCode = 403;
}
const workspaceContext = new AsyncLocalStorage<{
  requestedMerchantId: number | null;
  requiredPermission: Parameters<typeof requirePermission>[2] | null;
  explicitAuthorization: boolean;
  blocksLocationScoped: boolean;
}>();
const MARKETPLACE_MONTHLY_FEE = 5;
const MARKETPLACE_BILLING_DAYS = 30;
// Workspace selection is an authenticated, server-validated identifier. Do not
// accept forwarded hosts or client-supplied tenant IDs in mutation bodies.
router.use((req, _res, next) => {
  const raw = req.header("x-ts-commerce-workspace-id");
  const requestedMerchantId = raw && /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
  const path = req.path;
  const explicitAuthorization = /^(\/healthz|\/public\/|\/admin\/|\/invitations\/accept|\/workspaces(?:\/|$)|\/team(?:\/|$))/.test(path);
  const requiredPermission =
    /^\/settings(?:\/|$)|^\/store$/.test(path) ? "team.manage" :
    /^\/dashboard(?:\/|$)/.test(path) ? "orders.read" :
    /^\/ai\/actions\/[^/]+\/(approve|reject)/.test(path) ? "ai.approve" :
    /^\/ai\/actions\/[^/]+\/(execute|rollback)/.test(path) ? "ai.execute" :
    /^\/ai(?:\/|$)/.test(path) ? (req.method === "GET" ? "finance.read" : "ai.execute") :
    /^(\/withdrawals|\/security\/withdrawal)/.test(path) ? "withdrawals.manage" :
    /^\/bank-account/.test(path) ? "bank_accounts.manage" :
    /^\/payments\/[^/]+\/verify/.test(path) ? "payments.verify" :
    /^\/invoices\/[^/]+\/payments\/[^/]+\/verify/.test(path) ? "payments.verify" :
    /^\/refunds/.test(path) ? "refunds.manage" :
    /^\/reconciliations?|^\/balances/.test(path) ? (req.method === "GET" ? "finance.read" : "finance.manage") :
    /^\/payments(?:\/|$)/.test(path) ? "finance.manage" :
    /^\/subscription(?:\/|$)/.test(path) ? (req.method === "GET" ? "finance.read" : "finance.manage") :
    /^\/marketing\/billing(?:\/|$)/.test(path) ? "finance.read" :
    /^\/marketing(?:\/|$)/.test(path) ? "finance.manage" :
    /^\/inventory\/adjustments/.test(path) ? "inventory.adjust" :
    /^\/inventory(?:\/|$)/.test(path) ? "inventory.read" :
    /^\/orders(?:\/|$)/.test(path) ? (req.method === "GET" ? "orders.read" : "orders.manage") :
    /^\/invoices(?:\/|$)/.test(path) ? (req.method === "GET" ? "finance.read" : "finance.manage") :
    /^\/payment-links(?:\/|$)/.test(path) ? (req.method === "GET" ? "finance.read" : "finance.manage") :
    /^\/customers(?:\/|$)/.test(path) ? (req.method === "GET" ? "customers.read" : "customers.manage") :
    /^\/exports(?:\/|$)/.test(path) ? "customers.export" :
    /^\/supplier-products|^\/supplier-import-history|^\/suppliers(?:\/|$)/.test(path) ? "marketplace.manage" :
    /^\/dropship(?:\/|$)/.test(path) ? "fulfillment.manage" :
    /^\/merchant\/auctions(?:\/|$)/.test(path) ? "marketplace.manage" :
    /^\/auctions$/.test(path) && req.method === "POST" ? "marketplace.manage" :
    /^\/marketplace\/(management|listings|billing)/.test(path) ? "marketplace.manage" :
    /^\/marketplace\/products/.test(path) && req.method !== "GET" ? "marketplace.manage" :
    /^\/events(?:\/|$)|^\/notifications(?:\/|$)/.test(path) ? "orders.read" : null;
  const blocksLocationScoped = !(/^\/marketplace\/products/.test(path) && req.method === "GET") && /^(\/settings|\/store|\/dashboard|\/ai|\/marketing|\/withdrawals|\/security\/withdrawal|\/bank-account|\/payments|\/refunds|\/reconciliations?|\/balances|\/subscription|\/payment-links|\/customers|\/exports|\/supplier-products|\/supplier-import-history|\/suppliers|\/merchant\/auctions|\/marketplace|\/events|\/notifications)/.test(path);
  workspaceContext.run({ requestedMerchantId, requiredPermission, explicitAuthorization, blocksLocationScoped }, next);
});
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
type FxPayload = {
  base: string;
  quote: string;
  rate: number;
  source: string;
  fetchedAt: string;
  asOf: string | null;
};
const fxCache = new Map<string, { expiresAt: number; payload: FxPayload }>();

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
  verifiedEmails: Set<string>;
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

async function refreshInvoiceOverdue(invoice: typeof invoicesTable.$inferSelect) {
  const nextStatus = invoiceStatusForDueDate(invoice.status, invoice.dueDate);
  if (nextStatus === invoice.status) return invoice;
  const [updated] = await db.update(invoicesTable).set({ status: nextStatus })
    .where(and(eq(invoicesTable.id, invoice.id), eq(invoicesTable.status, invoice.status)))
    .returning();
  if (updated) return updated;
  return (await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoice.id)).limit(1))[0] ?? invoice;
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

function daysSince(date: Date, timeZone = "UTC"): number {
  return calendarDaysSince(date, new Date(), timeZone);
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

async function getMarketExchangeRate(base: string, quote: string): Promise<FxPayload> {
  if (base === quote) {
    const now = new Date().toISOString();
    return {
      base,
      quote,
      rate: 1,
      source: "Identity rate",
      fetchedAt: now,
      asOf: now,
    };
  }
  const cacheKey = `${base}:${quote}`;
  const cached = fxCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;
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
  return payload;
}

async function getSubscriptionQuote(currency: string) {
  const fx = await getMarketExchangeRate("USD", currency);
  return {
    amountDue: Number((MONTHLY_FEE * fx.rate).toFixed(2)),
    baseAmountUsd: MONTHLY_FEE,
    currency,
    fxRate: fx.rate,
    fxSource: fx.source,
    fxAsOf: fx.asOf ? new Date(fx.asOf) : null,
  };
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
    verifiedEmails: new Set(user.emailAddresses.filter((address) => address.verification?.status === "verified").map((address) => address.emailAddress.toLowerCase())),
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

/** Converts durable authorization failures into an API 403, not an Express 500. */
async function requireTenantPermission(identity: Identity, merchantId: number, permission: Parameters<typeof requirePermission>[2], res: Response) {
  try {
    return await requirePermission(identity.clerkUserId, merchantId, permission);
  } catch {
    res.status(403).json({ error: "You do not have permission for this action" });
    return null;
  }
}

/** Resolve location server-side; client values can only narrow an active membership scope. */
async function resolveOrderLocation(
  merchantId: number,
  access: TenantAccess | null,
  requestedLocationId?: string | null,
  forceDefault = false,
) {
  const locations = await db.select().from(merchantLocationsTable)
    .where(and(eq(merchantLocationsTable.merchantId, merchantId), eq(merchantLocationsTable.isActive, true)))
    .orderBy(desc(merchantLocationsTable.isDefault));
  if (forceDefault) {
    const location = locations.find((item) => item.isDefault);
    if (!location) throw new Error("Merchant has no active default location");
    return location;
  }
  const allowed = locations.filter((item) => access?.locationIds === null || access?.locationIds.has(item.id));
  if (!allowed.length) throw new Error("No active location is assigned to your membership");
  if (requestedLocationId) {
    const requested = allowed.find((item) => item.id === requestedLocationId);
    if (requested) return requested;
  }
  return allowed.find((item) => item.isDefault) ?? allowed[0]!;
}

async function getOrCreateMerchant(identity: Identity): Promise<Merchant> {
  if (identity.isAdmin) {
    throw new CommerceAuthorizationError("Master admin accounts cannot use merchant workspaces");
  }
  const context = workspaceContext.getStore();
  const requestedMerchantId = context?.requestedMerchantId ?? null;
  const memberships = await db.select({ merchantId: merchantMembershipsTable.merchantId })
    .from(merchantMembershipsTable)
    .where(and(eq(merchantMembershipsTable.clerkUserId, identity.clerkUserId), eq(merchantMembershipsTable.status, "active")));
  const selectedMerchantId = requestedMerchantId ?? (memberships.length === 1 ? memberships[0]!.merchantId : null);
  if (requestedMerchantId && !memberships.some((membership) => membership.merchantId === requestedMerchantId)) {
    throw new CommerceAuthorizationError("Selected workspace is not an active membership");
  }
  if (selectedMerchantId) {
    const selected = (await db.select().from(merchantsTable).where(eq(merchantsTable.id, selectedMerchantId)).limit(1))[0];
    if (!selected) throw new CommerceAuthorizationError("Selected workspace no longer exists");
    const access = await getTenantAccess(identity.clerkUserId, selected.id);
    if (!access) throw new CommerceAuthorizationError("Active workspace membership required");
    if (context?.requiredPermission && !access.permissions.has(context.requiredPermission)) {
      throw new CommerceAuthorizationError(`Missing required permission: ${context.requiredPermission}`);
    }
    if (!context?.requiredPermission && !context?.explicitAuthorization) {
      throw new CommerceAuthorizationError("This merchant route has no authorization policy");
    }
    if (context?.blocksLocationScoped && access.locationIds !== null) {
      throw new CommerceAuthorizationError("This route is unavailable to location-scoped staff");
    }
    return selected;
  }
  if (memberships.length > 1) {
    throw new CommerceAuthorizationError("Workspace selection required");
  }
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
    await ensureTenantOwnerMembership(merchant.id, identity.clerkUserId);
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
    // The membership is seeded after the transaction below, because the
    // access helper opens its own transaction.
    return created;
  }).then(async (created) => {
    await ensureTenantOwnerMembership(created.id, identity.clerkUserId);
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
    const quote = isAdmin
      ? {
          amountDue: 0,
          baseAmountUsd: 0,
          currency: merchant.currency,
          fxRate: 1,
          fxSource: "Identity rate",
          fxAsOf: null,
        }
      : await getSubscriptionQuote(merchant.currency);
    [subscription] = await db
      .insert(subscriptionsTable)
      .values({
        merchantId: merchant.id,
        amountDue: quote.amountDue.toFixed(2),
        baseAmountUsd: quote.baseAmountUsd.toFixed(2),
        currency: quote.currency,
        fxRate: quote.fxRate.toFixed(8),
        fxSource: quote.fxSource,
        fxAsOf: quote.fxAsOf,
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
  if (!subscription.billingTimezone) {
    const location = (
      await db
        .select({ timezone: merchantLocationsTable.timezone })
        .from(merchantLocationsTable)
        .where(and(eq(merchantLocationsTable.merchantId, merchant.id), eq(merchantLocationsTable.isActive, true)))
        .orderBy(desc(merchantLocationsTable.isDefault))
        .limit(1)
    )[0];
    [subscription] = await db
      .update(subscriptionsTable)
      .set({ billingTimezone: safeTimeZone(location?.timezone) })
      .where(eq(subscriptionsTable.id, subscription.id))
      .returning();
  }
  }
  const shouldReprice =
    !isAdmin &&
    subscription.currency !== merchant.currency &&
    toNumber(subscription.amountPaid) === 0 &&
    toNumber(subscription.earningsHeld) === 0;
  if (shouldReprice) {
    const quote = await getSubscriptionQuote(merchant.currency);
    [subscription] = await db
      .update(subscriptionsTable)
      .set({
        amountDue: quote.amountDue.toFixed(2),
        baseAmountUsd: quote.baseAmountUsd.toFixed(2),
        currency: quote.currency,
        fxRate: quote.fxRate.toFixed(8),
        fxSource: quote.fxSource,
        fxAsOf: quote.fxAsOf,
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
      .set({
        amountDue: "0",
        baseAmountUsd: "0",
        amountPaid: "0",
        earningsHeld: "0",
        currency: merchant.currency,
        fxRate: "1",
        fxSource: "Identity rate",
        fxAsOf: null,
        status: "active",
      })
        .where(eq(subscriptionsTable.id, subscription.id))
        .returning();
    }
    return { merchant, subscription };
  }

  const remaining = Math.max(
    0,
    toNumber(subscription.amountDue) - toNumber(subscription.amountPaid),
  );
  const days = daysSince(merchant.registeredAt, subscription.billingTimezone ?? "UTC");

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
  const days = daysSince(merchant.registeredAt, subscription.billingTimezone ?? "UTC");
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
      : `Pay ${subscription.currency} ${remaining.toFixed(2)} from dashboard or choose Pay from bank`;
  if (!admin && days >= 10 && days < 15 && remaining > 0) {
    nextAction = `Warning: ${15 - days} days left to settle your subscription`;
  }
  if (!admin && days >= 15 && remaining > 0) {
    nextAction =
      "Account suspended — choose Pay from bank and submit the payment for admin review to restore access";
  }
  return {
    id: subscription.id,
    email: merchant.email,
    isAdmin: admin,
    amountDue: toNumber(subscription.amountDue),
    baseAmountUsd: toNumber(subscription.baseAmountUsd),
    currency: subscription.currency,
    fxRate: toNumber(subscription.fxRate),
    fxSource: subscription.fxSource,
    fxAsOf:
      subscription.fxAsOf && !Number.isNaN(subscription.fxAsOf.getTime())
        ? subscription.fxAsOf
        : null,
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
    paymentMethod:
      subscription.paymentMethod === "earnings"
        ? "Pay from dashboard"
        : subscription.paymentMethod === "bank"
          ? "Pay from bank"
          : subscription.paymentMethod,
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

function invoiceAddress(value: unknown): string | null {
  const record = jsonRecord(value);
  return typeof record.formatted === "string" ? record.formatted : null;
}

function serializeInvoicePayment(payment: typeof invoicePaymentSubmissionsTable.$inferSelect) {
  return {
    id: payment.id, amount: toNumber(payment.amount), currency: payment.currency,
    paymentReference: payment.paymentReference, senderName: payment.senderName,
    status: payment.status, reviewNote: payment.reviewNote, createdAt: payment.createdAt,
  };
}

async function serializeInvoice(invoice: typeof invoicesTable.$inferSelect) {
  const [lines, payments] = await Promise.all([
    db.select().from(invoiceLinesTable).where(eq(invoiceLinesTable.invoiceId, invoice.id)).orderBy(asc(invoiceLinesTable.position)),
    db.select().from(invoicePaymentSubmissionsTable).where(eq(invoicePaymentSubmissionsTable.invoiceId, invoice.id)).orderBy(desc(invoicePaymentSubmissionsTable.createdAt)),
  ]);
  return {
    id: invoice.id, invoiceNumber: invoice.invoiceNumber, publicPath: `/invoice/${invoice.publicToken}`,
    customerName: invoice.customerName, customerEmail: invoice.customerEmail, customerPhone: invoice.customerPhone,
    billingAddress: invoiceAddress(invoice.billingAddress), shippingAddress: invoiceAddress(invoice.shippingAddress),
    currency: invoice.currency, subtotal: toNumber(invoice.subtotal), discountAmount: toNumber(invoice.discountAmount),
    taxAmount: toNumber(invoice.taxAmount), shippingAmount: toNumber(invoice.shippingAmount), total: toNumber(invoice.total),
    amountPaid: toNumber(invoice.amountPaid), dueDate: invoice.dueDate, status: invoice.status,
    notes: invoice.notes, terms: invoice.terms,
    lines: lines.map((line) => ({ id: line.id, description: line.description, quantity: toNumber(line.quantity), unitPrice: toNumber(line.unitPrice), lineTotal: toNumber(line.lineTotal) })),
    payments: payments.map(serializeInvoicePayment), createdAt: invoice.createdAt, sentAt: invoice.sentAt,
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

function serializePaymentLink(link: typeof paymentLinksTable.$inferSelect) {
  return {
    id: link.id,
    token: link.token,
    title: link.title,
    description: link.description,
    amount: toNumber(link.amount),
    currency: link.currency,
    status: link.status,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    publicPath: `/pay/${link.token}`,
    createdAt: link.createdAt.toISOString(),
  };
}

function serializePublicPaymentLink(link: typeof paymentLinksTable.$inferSelect) {
  return {
    token: link.token,
    title: link.title,
    description: link.description,
    amount: toNumber(link.amount),
    currency: link.currency,
    expiresAt: link.expiresAt?.toISOString() ?? null,
  };
}

function serializeMarketplaceListing(
  listing: typeof marketplaceListingsTable.$inferSelect,
  product: typeof supplierProductsTable.$inferSelect,
) {
  return {
    id: listing.id,
    supplierProductId: listing.supplierProductId,
    productTitle: product.title,
    productStatus: product.status,
    status: listing.status,
    reviewNote: listing.reviewNote,
    listingFeeAmount: toNumber(listing.listingFeeAmount),
    listingFeeCurrency: listing.listingFeeCurrency,
    listingFeeStatus: listing.listingFeeStatus,
    createdAt: listing.createdAt.toISOString(),
    reviewedAt: listing.reviewedAt?.toISOString() ?? null,
  };
}

function serializeMarketplaceBilling(record: typeof marketplaceBillingRecordsTable.$inferSelect) {
  return {
    id: record.id,
    listingId: record.listingId,
    kind: record.kind,
    amount: toNumber(record.amount),
    currency: record.currency,
    status: record.status,
    paymentReference: record.paymentReference,
    reviewNote: record.reviewNote,
    createdAt: record.createdAt.toISOString(),
    paidAt: record.paidAt?.toISOString() ?? null,
  };
}

function serializeAdvertisingPayment(
  record: typeof advertisingPaymentsTable.$inferSelect,
) {
  return {
    id: record.id,
    aiActionId: record.aiActionId,
    amount: toNumber(record.amount),
    currency: record.currency,
    method: record.method,
    status: record.status,
    paymentReference: record.paymentReference,
    reviewNote: record.reviewNote,
    createdAt: record.createdAt.toISOString(),
    paidAt: record.paidAt?.toISOString() ?? null,
  };
}

function getAdvertisingBudget(
  action: typeof aiActionsTable.$inferSelect,
): { amount: number; currency: string } | null {
  const dataUsed =
    action.dataUsed && typeof action.dataUsed === "object"
      ? (action.dataUsed as Record<string, unknown>)
      : {};
  const amount =
    typeof dataUsed.budgetAmount === "number" ? dataUsed.budgetAmount : 0;
  const currency =
    typeof dataUsed.budgetCurrency === "string"
      ? dataUsed.budgetCurrency
      : "";
  return amount > 0 && currency ? { amount, currency } : null;
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
  await getSubscriptionForMerchant(merchant);
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
        currency: subscription.currency,
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
      currency: subscription.currency,
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
  const currentSubscription = await getSubscriptionForMerchant(
    merchant,
    identity.isAdmin,
  );
  const shouldReprice =
    !identity.isAdmin &&
    currentSubscription.currency !== currency &&
    toNumber(currentSubscription.amountPaid) === 0 &&
    toNumber(currentSubscription.earningsHeld) === 0;
  let quote:
    | Awaited<ReturnType<typeof getSubscriptionQuote>>
    | null = null;
  try {
    if (shouldReprice) quote = await getSubscriptionQuote(currency);
  } catch (error) {
    req.log.warn({ err: error, currency }, "Could not price subscription in selected currency");
    res.status(502).json({
      error: "The selected currency could not be priced right now. Nothing was changed.",
    });
    return;
  }
  const updated = await db.transaction(async (tx) => {
    const [nextMerchant] = await tx
      .update(merchantsTable)
      .set({ currency })
      .where(eq(merchantsTable.id, merchant.id))
      .returning();
    if (quote) {
      await tx
        .update(subscriptionsTable)
        .set({
          amountDue: quote.amountDue.toFixed(2),
          baseAmountUsd: quote.baseAmountUsd.toFixed(2),
          currency: quote.currency,
          fxRate: quote.fxRate.toFixed(8),
          fxSource: quote.fxSource,
          fxAsOf: quote.fxAsOf,
        })
        .where(eq(subscriptionsTable.id, currentSubscription.id));
    }
    return nextMerchant;
  });
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
    res.json(GetMarketExchangeRateResponse.parse(await getMarketExchangeRate(base, quote)));
    return;
  }
  try {
    res.json(GetMarketExchangeRateResponse.parse(await getMarketExchangeRate(base, quote)));
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
  const storeDescription = parsed.data.storeDescription?.trim().replace(/\s+/g, " ") || null;
  const storeContactEmail = parsed.data.storeContactEmail?.trim().toLowerCase() || null;
  const storePhone = parsed.data.storePhone?.trim() || null;
  const storeWebsite = parsed.data.storeWebsite?.trim() || null;
  if (storeContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(storeContactEmail)) {
    res.status(400).json({ error: "Enter a valid store contact email" });
    return;
  }
  if (storeWebsite) {
    try {
      const url = new URL(storeWebsite);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid");
    } catch {
      res.status(400).json({ error: "Enter a valid http or https store website" });
      return;
    }
  }
  const [updated] = await db
    .update(merchantsTable)
    .set({ storeName, storeDescription, storeContactEmail, storePhone, storeWebsite, storeAddress: parsed.data.storeAddress ?? null })
    .where(eq(merchantsTable.id, merchant.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Merchant account not found" });
    return;
  }
  await addActivity(updated.id, {
    type: "store_updated",
    title: "Store profile saved",
     description: `Store profile updated for ${updated.storeName}.`,
    tone: "positive",
  });
  res.status(201).json(
    CreateStoreResponse.parse({
      id: updated.id,
      name: updated.name,
      storeName: updated.storeName,
      storeDescription: updated.storeDescription,
      storeContactEmail: updated.storeContactEmail,
      storePhone: updated.storePhone,
      storeWebsite: updated.storeWebsite,
      storeAddress: updated.storeAddress,
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
  const now = new Date();
  const currentPeriodStart = new Date(now.getTime() - 7 * 86400000);
  const previousPeriodStart = new Date(now.getTime() - 14 * 86400000);
  const [metrics] = await db
    .select({
      orders: sql<string>`count(*) filter (where ${ordersTable.status} <> 'cancelled')`,
      customers: sql<string>`count(distinct ${ordersTable.customerId})`,
      pendingBalance: sql<string>`coalesce(sum(${ordersTable.total}) filter (where ${ordersTable.status} = 'pending' and ${ordersTable.currency} = ${enforced.merchant.currency}), 0)`,
    })
    .from(ordersTable)
    .where(eq(ordersTable.merchantId, enforced.merchant.id));
  const [ledgerRevenue] = await db
    .select({
      total: sql<string>`coalesce(sum(${ledgerEntriesTable.amountMinor}), 0)`,
    })
    .from(ledgerEntriesTable)
    .where(
      and(
        eq(ledgerEntriesTable.merchantId, enforced.merchant.id),
        eq(ledgerEntriesTable.currency, enforced.merchant.currency),
        eq(ledgerEntriesTable.entryType, "sale"),
      ),
    );
  const [currentPeriod] = await db
    .select({
      total: sql<string>`coalesce(sum(${ledgerEntriesTable.amountMinor}), 0)`,
    })
    .from(ledgerEntriesTable)
    .where(
      and(
        eq(ledgerEntriesTable.merchantId, enforced.merchant.id),
        eq(ledgerEntriesTable.currency, enforced.merchant.currency),
        eq(ledgerEntriesTable.entryType, "sale"),
        gte(ledgerEntriesTable.createdAt, currentPeriodStart),
      ),
    );
  const [previousPeriod] = await db
    .select({
      total: sql<string>`coalesce(sum(${ledgerEntriesTable.amountMinor}), 0)`,
    })
    .from(ledgerEntriesTable)
    .where(
      and(
        eq(ledgerEntriesTable.merchantId, enforced.merchant.id),
        eq(ledgerEntriesTable.currency, enforced.merchant.currency),
        eq(ledgerEntriesTable.entryType, "sale"),
        gte(ledgerEntriesTable.createdAt, previousPeriodStart),
        lt(ledgerEntriesTable.createdAt, currentPeriodStart),
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
    .select({ amountMinor: ledgerEntriesTable.amountMinor, createdAt: ledgerEntriesTable.createdAt })
    .from(ledgerEntriesTable)
    .where(
      and(
        eq(ledgerEntriesTable.merchantId, enforced.merchant.id),
        eq(ledgerEntriesTable.currency, enforced.merchant.currency),
        eq(ledgerEntriesTable.entryType, "sale"),
        gte(ledgerEntriesTable.createdAt, seriesStart),
      ),
    );
  const seriesAmounts = new Map<string, number>();
  for (const sale of recentSales) {
    const key = sale.createdAt.toISOString().slice(0, 10);
    seriesAmounts.set(key, (seriesAmounts.get(key) ?? 0) + sale.amountMinor / 100);
  }
  const revenueSeries = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(seriesStart);
    day.setDate(seriesStart.getDate() + index);
    return {
      label: day.toLocaleDateString("en-US", { weekday: "short" }),
      amount: seriesAmounts.get(day.toISOString().slice(0, 10)) ?? 0,
    };
  });
  const revenue = Number(ledgerRevenue?.total ?? 0) / 100;
  const currentRevenue = Number(currentPeriod?.total ?? 0) / 100;
  const previousRevenue = Number(previousPeriod?.total ?? 0) / 100;
  const revenueChange =
    previousRevenue === 0
      ? currentRevenue > 0
        ? 100
        : 0
      : Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 100);
  const [ledgerBalance] = await db
    .select({
      total: sql<string>`coalesce(sum(${ledgerEntriesTable.amountMinor}), 0)`,
    })
    .from(ledgerEntriesTable)
    .where(
      and(
        eq(ledgerEntriesTable.merchantId, enforced.merchant.id),
        eq(ledgerEntriesTable.currency, enforced.merchant.currency),
      ),
    );
  const earningsHeldForSubscription =
    subscription.currency === enforced.merchant.currency
      ? subscription.earningsHeld
      : 0;
  const availableBalance = Math.max(
    0,
    Number(ledgerBalance?.total ?? 0) / 100 -
      earningsHeldForSubscription -
      toNumber(withdrawalReserve?.total),
  );
  res.json(
    GetDashboardOverviewResponse.parse({
      storeName: enforced.merchant.storeName,
      storeDescription: enforced.merchant.storeDescription,
      storeContactEmail: enforced.merchant.storeContactEmail,
      storePhone: enforced.merchant.storePhone,
      storeWebsite: enforced.merchant.storeWebsite,
      storeAddress: enforced.merchant.storeAddress,
      currency: enforced.merchant.currency,
      storeSlug: storeSlug(enforced.merchant.storeName),
      revenue,
      revenueChange,
      orders: Number(metrics?.orders ?? 0),
      customers: Number(metrics?.customers ?? 0),
      availableBalance,
      pendingBalance: toNumber(metrics?.pendingBalance),
      withdrawalReserved: toNumber(withdrawalReserve?.total),
      earningsHeldForSubscription,
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

router.get("/marketing/billing", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  try {
    const merchant = await getOrCreateMerchant(identity);
    const [balance, subscription, withdrawalReserve, payments] =
      await Promise.all([
        db
          .select({
            total: sql<string>`coalesce(sum(${ledgerEntriesTable.amountMinor}), 0)`,
          })
          .from(ledgerEntriesTable)
          .where(
            and(
              eq(ledgerEntriesTable.merchantId, merchant.id),
              eq(ledgerEntriesTable.currency, merchant.currency),
            ),
          ),
        db
          .select()
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.merchantId, merchant.id))
          .limit(1)
          .then(([row]) => row),
        db
          .select({
            total: sql<string>`coalesce(sum(${withdrawalsTable.amount}), 0)`,
          })
          .from(withdrawalsTable)
          .where(
            and(
              eq(withdrawalsTable.merchantId, merchant.id),
              eq(withdrawalsTable.currency, merchant.currency),
              inArray(withdrawalsTable.status, ["pending", "approved", "paid"]),
            ),
          )
          .then(([row]) => row),
        db
          .select()
          .from(advertisingPaymentsTable)
          .where(eq(advertisingPaymentsTable.merchantId, merchant.id))
          .orderBy(desc(advertisingPaymentsTable.createdAt)),
      ]);
    const ledgerBalance = Number(balance[0]?.total ?? 0) / 100;
    const heldSubscription =
      subscription?.currency === merchant.currency
        ? toNumber(subscription.earningsHeld)
        : 0;
    const availableBalance = Math.max(
      0,
      ledgerBalance - heldSubscription - toNumber(withdrawalReserve?.total),
    );
    res.json(
      GetMarketingBillingResponse.parse({
        currency: merchant.currency,
        availableBalance,
        payments: payments.map(serializeAdvertisingPayment),
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Could not load marketing billing");
    res.status(500).json({ error: "Advertising billing could not be loaded" });
  }
});

router.post(
  "/marketing/campaigns/:id/pay-earnings",
  async (req, res): Promise<void> => {
    const identity = await requireIdentity(req, res);
    if (!identity) return;
    const params = ExecuteAiActionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Campaign id is invalid" });
      return;
    }
    try {
      const merchant = await getOrCreateMerchant(identity);
      const payment = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select id from ${merchantsTable} where id = ${merchant.id} for update`,
        );
        await tx.execute(
          sql`select id from ${aiActionsTable} where id = ${params.data.id} and merchant_id = ${merchant.id} for update`,
        );
        const action = (
          await tx
            .select()
            .from(aiActionsTable)
            .where(
              and(
                eq(aiActionsTable.id, params.data.id),
                eq(aiActionsTable.merchantId, merchant.id),
              ),
            )
            .limit(1)
        )[0];
        if (!action || action.actionType !== "ad_draft") {
          throw new Error("Advertising campaign not found");
        }
        const budget = getAdvertisingBudget(action);
        if (!budget || budget.currency !== merchant.currency) {
          throw new Error("This campaign has no valid merchant-currency budget");
        }
        const existing = (
          await tx
            .select()
            .from(advertisingPaymentsTable)
            .where(eq(advertisingPaymentsTable.aiActionId, action.id))
            .orderBy(desc(advertisingPaymentsTable.createdAt))
            .limit(1)
        )[0];
        if (existing?.status === "confirmed") return existing;
        if (existing?.status === "pending_review") {
          throw new Error(
            "A manual advertising payment is awaiting review for this campaign",
          );
        }
        const [balance] = await tx
          .select({
            total: sql<string>`coalesce(sum(${ledgerEntriesTable.amountMinor}), 0)`,
          })
          .from(ledgerEntriesTable)
          .where(
            and(
              eq(ledgerEntriesTable.merchantId, merchant.id),
              eq(ledgerEntriesTable.currency, merchant.currency),
            ),
          );
        const subscription = (
          await tx
            .select()
            .from(subscriptionsTable)
            .where(eq(subscriptionsTable.merchantId, merchant.id))
            .limit(1)
        )[0];
        const [withdrawalReserve] = await tx
          .select({
            total: sql<string>`coalesce(sum(${withdrawalsTable.amount}), 0)`,
          })
          .from(withdrawalsTable)
          .where(
            and(
              eq(withdrawalsTable.merchantId, merchant.id),
              eq(withdrawalsTable.currency, merchant.currency),
              inArray(withdrawalsTable.status, [
                "pending",
                "approved",
                "paid",
              ]),
            ),
          );
        const available =
          Number(balance?.total ?? 0) / 100 -
          (subscription?.currency === merchant.currency
            ? toNumber(subscription.earningsHeld)
            : 0) -
          toNumber(withdrawalReserve?.total);
        if (available < budget.amount) {
          throw new Error(
            `Not enough available ${merchant.currency} earnings for this campaign`,
          );
        }
        const reference = `EARN-AD-${action.id}`;
        const [created] = await tx
          .insert(advertisingPaymentsTable)
          .values({
            merchantId: merchant.id,
            aiActionId: action.id,
            amount: budget.amount.toFixed(2),
            currency: budget.currency,
            method: "earnings",
            status: "confirmed",
            paymentReference: reference,
            idempotencyKey: `advertising-earnings:${action.id}`,
            paidAt: new Date(),
          })
          .onConflictDoNothing({
            target: advertisingPaymentsTable.idempotencyKey,
          })
          .returning();
        if (!created) {
          const prior = (
            await tx
              .select()
              .from(advertisingPaymentsTable)
              .where(
                eq(
                  advertisingPaymentsTable.idempotencyKey,
                  `advertising-earnings:${action.id}`,
                ),
              )
              .limit(1)
          )[0];
          if (!prior) throw new Error("Advertising payment could not be saved");
          return prior;
        }
        await tx.insert(ledgerEntriesTable).values({
          merchantId: merchant.id,
          amountMinor: -Math.round(budget.amount * 100),
          currency: budget.currency,
          entryType: "advertising",
          referenceKey: `advertising-payment:${created.id}`,
        });
        await tx.insert(activityTable).values({
          merchantId: merchant.id,
          type: "advertising_payment",
          title: "Advertising campaign paid from earnings",
          description: action.title,
          amount: budget.amount.toFixed(2),
          currency: budget.currency,
          tone: "negative",
        });
        await emitDomainEvent(tx, {
          merchantId: merchant.id,
          eventType: "advertising.payment_confirmed",
          aggregateType: "advertising_payment",
          aggregateId: created.id,
          actorType: "merchant",
          actorId: identity.clerkUserId,
          source: "merchant_api",
          idempotencyKey: `advertising-payment:${created.id}:confirmed`,
          payload: {
            aiActionId: action.id,
            amount: created.amount,
            currency: created.currency,
            method: created.method,
          },
        });
        return created;
      });
      res
        .status(201)
        .json(PayAdvertisingFromEarningsResponse.parse(serializeAdvertisingPayment(payment)));
    } catch (error) {
      req.log.error({ err: error }, "advertising earnings payment failed");
      res.status(409).json({
        error:
          error instanceof Error
            ? error.message
            : "Advertising earnings payment failed",
      });
    }
  },
);

router.post(
  "/marketing/campaigns/:id/payment-reference",
  async (req, res): Promise<void> => {
    const identity = await requireIdentity(req, res);
    if (!identity) return;
    const params = SubmitAdvertisingPaymentReferenceParams.safeParse(req.params);
    const body = SubmitAdvertisingPaymentReferenceBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Enter a valid advertising payment reference" });
      return;
    }
    try {
      const merchant = await getOrCreateMerchant(identity);
      const payment = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select id from ${aiActionsTable} where id = ${params.data.id} and merchant_id = ${merchant.id} for update`,
        );
        const action = (
          await tx
            .select()
            .from(aiActionsTable)
            .where(
              and(
                eq(aiActionsTable.id, params.data.id),
                eq(aiActionsTable.merchantId, merchant.id),
              ),
            )
            .limit(1)
        )[0];
        if (!action || action.actionType !== "ad_draft") {
          throw new Error("Advertising campaign not found");
        }
        const budget = getAdvertisingBudget(action);
        if (!budget || budget.currency !== merchant.currency) {
          throw new Error("This campaign has no valid merchant-currency budget");
        }
        const existing = (
          await tx
            .select()
            .from(advertisingPaymentsTable)
            .where(eq(advertisingPaymentsTable.aiActionId, action.id))
            .orderBy(desc(advertisingPaymentsTable.createdAt))
            .limit(1)
        )[0];
        if (existing?.status === "confirmed") return existing;
        if (existing?.status === "pending_review") {
          throw new Error(
            "A manual advertising payment is already awaiting review",
          );
        }
        const reference = body.data.paymentReference.trim();
        const [created] = await tx
          .insert(advertisingPaymentsTable)
          .values({
            merchantId: merchant.id,
            aiActionId: action.id,
            amount: budget.amount.toFixed(2),
            currency: budget.currency,
            method: "bank_transfer",
            status: "pending_review",
            paymentReference: reference,
            idempotencyKey: `advertising-reference:${reference.toUpperCase()}`,
          })
          .returning();
        if (!created) throw new Error("Advertising payment could not be saved");
        await tx.insert(activityTable).values({
          merchantId: merchant.id,
          type: "advertising_payment_submitted",
          title: "Advertising payment submitted for review",
          description: action.title,
          amount: budget.amount.toFixed(2),
          currency: budget.currency,
          tone: "neutral",
        });
        await emitDomainEvent(tx, {
          merchantId: merchant.id,
          eventType: "advertising.payment_submitted",
          aggregateType: "advertising_payment",
          aggregateId: created.id,
          actorType: "merchant",
          actorId: identity.clerkUserId,
          source: "merchant_api",
          idempotencyKey: `advertising-payment:${created.id}:submitted`,
          payload: {
            aiActionId: action.id,
            amount: created.amount,
            currency: created.currency,
          },
        });
        return created;
      });
      res
        .status(201)
        .json(SubmitAdvertisingPaymentReferenceResponse.parse(serializeAdvertisingPayment(payment)));
    } catch (error) {
      req.log.error({ err: error }, "advertising payment reference failed");
      res.status(409).json({
        error:
          error instanceof Error
            ? error.message
            : "Advertising payment reference could not be submitted",
      });
    }
  },
);

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

router.post("/ai/simulate", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = SimulateAiScenarioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a supported scenario and numeric value" });
    return;
  }
  try {
    const merchant = await getOrCreateMerchant(identity);
    const simulation = await simulateMerchantScenario(
      { id: merchant.id, currency: merchant.currency, storeName: merchant.storeName },
      parsed.data,
    );
    res.json(SimulateAiScenarioResponse.parse(simulation));
  } catch (error) {
    req.log.error({ err: error }, "Could not simulate AI scenario");
    res.status(500).json({ error: "Scenario simulation could not be completed" });
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
          goal: parsed.data.goal?.trim() || null,
          goalTarget:
            parsed.data.goalTarget === null || parsed.data.goalTarget === undefined
              ? null
              : parsed.data.goalTarget.toFixed(2),
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
        goal: updated.goal,
        goalTarget:
          updated.goalTarget === null ? null : toNumber(updated.goalTarget),
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
  if (
    parsed.data.actionType === "ad_draft" &&
    (!parsed.data.budgetAmount || parsed.data.budgetAmount <= 0)
  ) {
    res.status(400).json({
      error: "Advertising drafts require a positive campaign budget",
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
            budgetAmount:
              parsed.data.actionType === "ad_draft"
                ? parsed.data.budgetAmount
                : null,
            budgetCurrency:
              parsed.data.actionType === "ad_draft"
                ? merchant.currency
                : null,
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
      await emitDomainEvent(tx, { merchantId: merchant.id, eventType: "ai.action_proposed", aggregateType: "ai_action", aggregateId: created.id, actorType: "merchant", actorId: identity.clerkUserId, source: "ai", idempotencyKey: `ai-action:${created.id}:proposed`, payload: { actionType: created.actionType, status: created.status, risk: created.risk, reversible: created.reversible } });
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
      await emitDomainEvent(tx, { merchantId: merchant.id, eventType: "ai.action_approved", aggregateType: "ai_action", aggregateId: updated.id, actorType: "merchant", actorId: identity.clerkUserId, source: "merchant_api", idempotencyKey: `ai-action:${updated.id}:approved`, payload: { actionType: updated.actionType, status: updated.status }, before: { status: current.status }, after: { status: updated.status } });
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
      await emitDomainEvent(tx, { merchantId: merchant.id, eventType: "ai.action_rejected", aggregateType: "ai_action", aggregateId: updated.id, actorType: "merchant", actorId: identity.clerkUserId, source: "merchant_api", idempotencyKey: `ai-action:${updated.id}:rejected`, payload: { actionType: updated.actionType, status: updated.status }, before: { status: current.status }, after: { status: updated.status } });
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
      if (current.actionType === "ad_draft") {
        const confirmedPayment = (
          await tx
            .select({ id: advertisingPaymentsTable.id })
            .from(advertisingPaymentsTable)
            .where(
              and(
                eq(advertisingPaymentsTable.aiActionId, current.id),
                eq(advertisingPaymentsTable.status, "confirmed"),
              ),
            )
            .limit(1)
        )[0];
        if (!confirmedPayment) {
          throw new Error(
            "Confirm the advertising payment before executing this campaign",
          );
        }
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
      if (current.actionType === "product_draft") {
        const source = (await tx
          .select({
            title: supplierProductsTable.title,
            description: supplierProductsTable.description,
            sellingPrice: supplierProductsTable.sellingPrice,
            currency: supplierProductsTable.currency,
            category: supplierProductsTable.category,
          })
          .from(supplierProductsTable)
          .where(eq(supplierProductsTable.merchantId, merchant.id))
          .orderBy(desc(supplierProductsTable.updatedAt))
          .limit(1))[0];
        const brief = current.reason.split("merchant brief:")[1]?.trim() || current.title.replace(/^Product draft:\s*/i, "").trim();
        const sourceTitle = source?.title?.trim() || brief.slice(0, 80) || "New product";
        const description = source?.description?.trim() || `A considered ${sourceTitle.toLowerCase()} designed around the customer need in the merchant brief.`;
        result = {
          outcome: "product_draft_prepared",
          sideEffect: "none",
          message: "Draft copy is ready for merchant review. Nothing was published or added to the catalog.",
          draft: {
            title: sourceTitle,
            shortDescription: description.slice(0, 140),
            description: `${description} Review product claims, specifications, delivery terms, and price before publishing.`,
            features: ["Clear product positioning", "Reviewable customer benefits", "Merchant-controlled specifications"],
            benefits: ["Makes the core value easier to understand", "Creates a consistent product-page structure", "Keeps unsupported claims out of the draft"],
            seoTitle: `${sourceTitle} | ${merchant.storeName}`.slice(0, 60),
            seoDescription: description.slice(0, 160),
            tags: [source?.category, "new", "merchant-review"].filter(Boolean),
            category: source?.category ?? null,
            pricingSuggestion: source?.sellingPrice ? {
              amount: Number(source.sellingPrice),
              currency: source.currency,
              basis: "Existing catalog price reference; verify margin and market fit before publishing.",
            } : null,
          },
          evidence: {
            brief,
            sourceCatalogProduct: source?.title ?? null,
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
      await emitDomainEvent(tx, { merchantId: merchant.id, eventType: "ai.action_executed", aggregateType: "ai_action", aggregateId: updated.id, actorType: "merchant", actorId: identity.clerkUserId, source: "ai", idempotencyKey: `ai-action:${updated.id}:executed`, payload: { actionType: updated.actionType, status: updated.status, outcome: "prepared", sideEffect: "none" }, before: { status: current.status }, after: { status: updated.status } });
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
      await emitDomainEvent(tx, { merchantId: merchant.id, eventType: "ai.action_rolled_back", aggregateType: "ai_action", aggregateId: updated.id, actorType: "merchant", actorId: identity.clerkUserId, source: "merchant_api", idempotencyKey: `ai-action:${updated.id}:rolled_back`, payload: { actionType: updated.actionType, status: updated.status }, before: { status: current.status }, after: { status: updated.status } });
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
              total: sql<string>`coalesce(sum(${ledgerEntriesTable.amountMinor}), 0)`,
            })
            .from(ledgerEntriesTable)
            .where(
              and(
                eq(ledgerEntriesTable.merchantId, merchant.id),
                eq(ledgerEntriesTable.currency, merchant.currency),
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
        (identity.isAdmin
          ? toNumber(revenue?.total)
          : Number(revenue?.total ?? 0) / 100) -
        (identity.isAdmin || subscription?.currency !== merchant.currency
          ? 0
          : toNumber(subscription?.earningsHeld)) -
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

function contextRecord(id: string | number, target: string, snapshot: Record<string, unknown>) {
  return { id: String(id), target, snapshot };
}

function minorFromDecimal(value: string | number | null | undefined) {
  return Math.round(toNumber(value) * 100);
}

function contextImpact(
  currency: string | null,
  orderTotalMinor: number,
  paymentRecords: Array<typeof paymentRecordsTable.$inferSelect>,
  refunds: Array<typeof refundRecordsTable.$inferSelect>,
  ledgerEntries: Array<typeof ledgerEntriesTable.$inferSelect>,
  reservations: Array<typeof inventoryReservationsTable.$inferSelect> = [],
  movements: Array<typeof inventoryMovementsTable.$inferSelect> = [],
) {
  const verifiedPaidMinor = paymentRecords
    .filter((record) => record.status === "verified")
    .reduce((sum, record) => sum + record.amountMinor, 0);
  const refundedMinor = refunds
    .filter((refund) => refund.status === "processed")
    .reduce((sum, refund) => sum + refund.amountMinor, 0);
  return {
    currency,
    orderTotalMinor,
    verifiedPaidMinor,
    refundedMinor,
    netRevenueMinor: verifiedPaidMinor - refundedMinor,
    ledgerEffectMinor: ledgerEntries.reduce((sum, entry) => sum + entry.amountMinor, 0),
    reservedUnits: reservations.filter((item) => item.status === "reserved").reduce((sum, item) => sum + item.quantity, 0),
    committedUnits: movements.filter((item) => item.reason === "sale").reduce((sum, item) => sum + Math.abs(item.quantityDelta), 0),
    releasedUnits: reservations.filter((item) => ["released", "expired"].includes(item.status)).reduce((sum, item) => sum + item.quantity, 0)
      + movements.filter((item) => item.reason === "order_release").reduce((sum, item) => sum + Math.abs(item.quantityDelta), 0),
  };
}

function contextEvents(events: Array<typeof domainEventsTable.$inferSelect>) {
  return events.map(serializeDomainEvent);
}

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

router.get("/customers/:id/context", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const params = GetCustomerContextParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid customer" }); return; }
  const merchant = await getOrCreateMerchant(identity);
  // Customers are tenant-global. The route policy blocks location-scoped memberships.
  const access = await requireTenantPermission(identity, merchant.id, "customers.read", res); if (!access) return;
  const customer = (await db.select().from(customersTable).where(and(eq(customersTable.id, params.data.id), eq(customersTable.merchantId, merchant.id))).limit(1))[0];
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  const orders = await db.select().from(ordersTable).where(and(eq(ordersTable.merchantId, merchant.id), eq(ordersTable.customerId, customer.id))).orderBy(desc(ordersTable.createdAt));
  const orderIds = orders.map((order) => order.id);
  const [invoices, intents, records, refunds, events] = await Promise.all([
    db.select().from(invoicesTable).where(and(eq(invoicesTable.merchantId, merchant.id), eq(invoicesTable.customerId, customer.id))).orderBy(desc(invoicesTable.createdAt)),
    orderIds.length ? db.select().from(paymentIntentsTable).where(and(eq(paymentIntentsTable.merchantId, merchant.id), inArray(paymentIntentsTable.orderId, orderIds))) : Promise.resolve([]),
    orderIds.length ? db.select().from(paymentRecordsTable).where(and(eq(paymentRecordsTable.merchantId, merchant.id), inArray(paymentRecordsTable.orderId, orderIds))) : Promise.resolve([]),
    orderIds.length ? db.select().from(refundRecordsTable).where(and(eq(refundRecordsTable.merchantId, merchant.id), inArray(refundRecordsTable.orderId, orderIds))) : Promise.resolve([]),
    db.select().from(domainEventsTable).where(eq(domainEventsTable.merchantId, merchant.id)).orderBy(desc(domainEventsTable.occurredAt)).limit(200),
  ]);
  const intentIds = intents.map((intent) => intent.id);
  const recordIds = records.map((record) => record.id);
  const refundIds = refunds.map((refund) => refund.id);
  const relevantEvents = events.filter((event) => (event.aggregateType === "customer" && event.aggregateId === String(customer.id))
    || (event.aggregateType === "order" && orderIds.includes(Number(event.aggregateId)))
    || (event.aggregateType === "payment_intent" && intentIds.includes(Number(event.aggregateId)))
    || (event.aggregateType === "payment_record" && recordIds.includes(Number(event.aggregateId)))
    || (event.aggregateType === "refund" && refundIds.includes(Number(event.aggregateId))));
  const currency = orders.length && orders.every((order) => order.currency === orders[0]!.currency) ? orders[0]!.currency : null;
  const lifetime = contextImpact(currency, orders.reduce((sum, order) => sum + minorFromDecimal(order.total), 0), records, refunds, []);
  res.json(GetCustomerContextResponse.parse({
    customer: contextRecord(customer.id, `/customers/${customer.id}`, customer),
    lifetime,
    orders: orders.map((order) => contextRecord(order.id, `/orders/${order.id}`, order)),
    invoices: invoices.map((invoice) => contextRecord(invoice.id, `/invoices/${invoice.id}`, invoice)),
    paymentIntents: intents.map((intent) => contextRecord(intent.id, `/payments/${intent.id}`, intent)),
    paymentRecords: records.map((record) => contextRecord(record.id, `/payments/${record.intentId}`, record)),
    refunds: refunds.map((refund) => contextRecord(refund.id, `/refunds/${refund.id}`, refund)),
    events: contextEvents(relevantEvents),
    nextActions: [],
  }));
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
  const access = await requireTenantPermission(identity, merchant.id, "orders.read", res); if (!access) return;
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
    .where(and(eq(ordersTable.merchantId, merchant.id), access.locationIds ? inArray(ordersTable.locationId, [...access.locationIds]) : undefined))
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

router.get("/orders/:id/context", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const params = GetOrderContextParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid order" }); return; }
  const merchant = await getOrCreateMerchant(identity);
  const access = await requireTenantPermission(identity, merchant.id, "orders.read", res); if (!access) return;
  const order = (await db.select().from(ordersTable).where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.merchantId, merchant.id))).limit(1))[0];
  if (!order || !(await requireLocationScope(access, order.locationId))) { res.status(404).json({ error: "Order not found" }); return; }
  const [customer, product, intents, records, ledgerEntries, refunds, invoices, reservations, movements, transitions, events] = await Promise.all([
    db.select().from(customersTable).where(and(eq(customersTable.id, order.customerId), eq(customersTable.merchantId, merchant.id))).limit(1),
    order.supplierProductId ? db.select().from(supplierProductsTable).where(and(eq(supplierProductsTable.id, order.supplierProductId), eq(supplierProductsTable.merchantId, merchant.id))).limit(1) : Promise.resolve([]),
    db.select().from(paymentIntentsTable).where(and(eq(paymentIntentsTable.merchantId, merchant.id), eq(paymentIntentsTable.orderId, order.id))),
    db.select().from(paymentRecordsTable).where(and(eq(paymentRecordsTable.merchantId, merchant.id), eq(paymentRecordsTable.orderId, order.id))),
    db.select().from(ledgerEntriesTable).where(and(eq(ledgerEntriesTable.merchantId, merchant.id), eq(ledgerEntriesTable.orderId, order.id))),
    db.select().from(refundRecordsTable).where(and(eq(refundRecordsTable.merchantId, merchant.id), eq(refundRecordsTable.orderId, order.id))),
    db.select().from(invoicesTable).where(and(eq(invoicesTable.merchantId, merchant.id), eq(invoicesTable.orderId, order.id))),
    db.select().from(inventoryReservationsTable).where(and(eq(inventoryReservationsTable.merchantId, merchant.id), eq(inventoryReservationsTable.orderId, order.id))),
    db.select().from(inventoryMovementsTable).where(and(eq(inventoryMovementsTable.merchantId, merchant.id), eq(inventoryMovementsTable.orderId, order.id))),
    db.select().from(commerceTransitionHistoryTable).where(and(eq(commerceTransitionHistoryTable.merchantId, merchant.id), eq(commerceTransitionHistoryTable.orderId, order.id))).orderBy(desc(commerceTransitionHistoryTable.createdAt)),
    db.select().from(domainEventsTable).where(eq(domainEventsTable.merchantId, merchant.id)).orderBy(desc(domainEventsTable.occurredAt)).limit(200),
  ]);
  const nextActions: Array<{ action: string; target: string }> = [];
  if (intents.some((intent) => ["created", "submitted"].includes(intent.status)) && access.permissions.has("payments.verify")) nextActions.push({ action: "verify_payment", target: `/payments/${intents.find((intent) => ["created", "submitted"].includes(intent.status))!.id}/verify` });
  if (refunds.some((refund) => refund.status === "requested") && access.permissions.has("refunds.manage")) nextActions.push({ action: "approve_refund", target: `/refunds/${refunds.find((refund) => refund.status === "requested")!.id}/approve` });
  if (["paid", "fulfilled"].includes(order.status) && ["pending", "ready"].includes(order.fulfillmentStatus) && access.permissions.has("fulfillment.manage")) nextActions.push({ action: "fulfill_order", target: `/dropship/queue/${order.id}` });
  if (order.supplierProductId && order.supplierPaymentStatus === "unpaid" && access.permissions.has("fulfillment.manage")) nextActions.push({ action: "submit_supplier_payment", target: `/dropship/queue/${order.id}` });
  res.json(GetOrderContextResponse.parse({
    order: contextRecord(order.id, `/orders/${order.id}`, order),
    customer: customer[0] ? contextRecord(customer[0].id, `/customers/${customer[0].id}`, customer[0]) : null,
    product: product[0] ? contextRecord(product[0].id, `/supplier-products/${product[0].id}`, { id: product[0].id, title: product[0].title, sku: product[0].sku, sourceUrl: product[0].sourceUrl, sourceDomain: product[0].sourceDomain, inventoryStatus: product[0].inventoryStatus }) : null,
    paymentIntents: intents.map((item) => contextRecord(item.id, `/payments/${item.id}`, item)),
    paymentRecords: records.map((item) => contextRecord(item.id, `/payments/${item.intentId}`, item)),
    ledgerEntries: ledgerEntries.map((item) => contextRecord(item.id, `/ledger/${item.id}`, item)),
    refunds: refunds.map((item) => contextRecord(item.id, `/refunds/${item.id}`, item)),
    invoices: invoices.map((item) => contextRecord(item.id, `/invoices/${item.id}`, item)),
    inventoryReservations: reservations.map((item) => contextRecord(item.id, `/inventory/reservations/${item.id}`, item)),
    inventoryMovements: movements.map((item) => contextRecord(item.id, `/inventory/movements/${item.id}`, item)),
    transitions: transitions.map((item) => contextRecord(item.id, `/orders/${order.id}/history/${item.id}`, item)),
    fulfillment: { status: order.fulfillmentStatus, supplierOrderReference: order.supplierOrderReference, trackingNumber: order.trackingNumber, note: order.fulfillmentNote, submittedAt: order.fulfillmentSubmittedAt, updatedAt: order.fulfillmentUpdatedAt, target: `/dropship/queue/${order.id}` },
    events: contextEvents(events.filter((event) => event.aggregateId === String(order.id)
      || (event.aggregateType === "payment_intent" && intents.some((item) => item.id === Number(event.aggregateId)))
      || (event.aggregateType === "payment_record" && records.some((item) => item.id === Number(event.aggregateId)))
      || (event.aggregateType === "refund" && refunds.some((item) => item.id === Number(event.aggregateId)))
      || (event.aggregateType === "invoice" && invoices.some((item) => item.id === Number(event.aggregateId))))),
    impact: contextImpact(order.currency, minorFromDecimal(order.total), records, refunds, ledgerEntries, reservations, movements),
    nextActions,
  }));
});

function serializeDomainEvent(event: typeof domainEventsTable.$inferSelect) {
  return {
    id: event.id, eventType: event.eventType, payloadVersion: event.payloadVersion,
    aggregateType: event.aggregateType, aggregateId: event.aggregateId, actorType: event.actorType,
    source: event.source, status: event.status, attempts: event.attempts, occurredAt: event.occurredAt,
    processedAt: event.processedAt, lastError: event.lastError,
  };
}

router.get("/events", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const aggregateType = typeof req.query.aggregateType === "string" ? req.query.aggregateType.trim() : "";
  const aggregateId = typeof req.query.aggregateId === "string" ? req.query.aggregateId.trim() : "";
  const correlationId = typeof req.query.correlationId === "string" ? req.query.correlationId.trim() : "";
  if ((aggregateType && aggregateType.length > 80) || (aggregateId && aggregateId.length > 120)
    || (correlationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(correlationId))) {
    res.status(400).json({ error: "Invalid event filters" }); return;
  }
  const events = await db.select().from(domainEventsTable)
    .where(and(eq(domainEventsTable.merchantId, merchant.id), aggregateType ? eq(domainEventsTable.aggregateType, aggregateType) : undefined,
      aggregateId ? eq(domainEventsTable.aggregateId, aggregateId) : undefined,
      correlationId ? eq(domainEventsTable.correlationId, correlationId) : undefined)).orderBy(desc(domainEventsTable.occurredAt)).limit(200);
  res.json(ListDomainEventsResponse.parse(events.map(serializeDomainEvent)));
});

router.post("/events/:id/replay", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const params = ReplayDomainEventParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid event" }); return; }
  const merchant = await getOrCreateMerchant(identity);
  const [event] = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${domainEventsTable} where id=${params.data.id} and merchant_id=${merchant.id} for update`);
    const current = (await tx.select().from(domainEventsTable).where(and(eq(domainEventsTable.id, params.data.id), eq(domainEventsTable.merchantId, merchant.id))).limit(1))[0];
    if (!current) throw new Error("Event not found");
    if (!["retry", "dead_letter"].includes(current.status)) throw new Error("Only failed or dead-letter events may be replayed");
    // This endpoint only clears projection receipts and requeues the outbox;
    // it never calls an order, payment, ledger, or inventory mutation.
    await tx.delete(domainEventConsumptionsTable).where(eq(domainEventConsumptionsTable.eventId, current.id));
    const [queued] = await tx.update(domainEventsTable).set({ status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null, processedAt: null })
      .where(and(eq(domainEventsTable.id, current.id), inArray(domainEventsTable.status, ["retry", "dead_letter"]))).returning();
    if (!queued) throw new Error("Could not queue event replay");
    return [queued];
  });
  res.json(ReplayDomainEventResponse.parse(serializeDomainEvent(event)));
});

router.get("/notifications", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const rows = await db.select({ notification: notificationsTable, source: domainEventsTable.source })
    .from(notificationsTable).leftJoin(domainEventsTable, eq(notificationsTable.eventId, domainEventsTable.id))
    .where(eq(notificationsTable.merchantId, merchant.id)).orderBy(desc(notificationsTable.createdAt)).limit(200);
  res.json(ListNotificationsResponse.parse(rows.map(({ notification, source }) => ({
    id: notification.id, eventId: notification.eventId, entityType: notification.entityType, entityId: notification.entityId,
    title: notification.title, body: notification.body, severity: notification.severity, deepLink: notification.deepLink,
    actionLabel: notification.actionLabel, actorType: notification.actorType, source: source ?? null,
    readAt: notification.readAt, createdAt: notification.createdAt,
  }))));
});

router.post("/notifications/:id/read", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid notification" }); return; }
  const merchant = await getOrCreateMerchant(identity);
  const [notification] = await db.update(notificationsTable).set({ readAt: new Date() })
    .where(and(eq(notificationsTable.id, params.data.id), eq(notificationsTable.merchantId, merchant.id))).returning();
  if (!notification) { res.status(404).json({ error: "Notification not found" }); return; }
  const [event] = notification.eventId ? await db.select({ source: domainEventsTable.source }).from(domainEventsTable)
    .where(and(eq(domainEventsTable.id, notification.eventId), eq(domainEventsTable.merchantId, merchant.id))).limit(1) : [];
  res.json(MarkNotificationReadResponse.parse({ ...notification, source: event?.source ?? null }));
});

// Team administration is deliberately tenant-derived: this surface never
// accepts a merchant id from the browser.
router.get("/workspaces", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const rows = await db.select({ merchant: merchantsTable, role: merchantRolesTable.key, roleId: merchantRolesTable.id })
    .from(merchantMembershipsTable).innerJoin(merchantsTable, eq(merchantMembershipsTable.merchantId, merchantsTable.id))
    .innerJoin(merchantRolesTable, eq(merchantMembershipsTable.roleId, merchantRolesTable.id))
    .where(and(eq(merchantMembershipsTable.clerkUserId, identity.clerkUserId), eq(merchantMembershipsTable.status, "active")));
  const permissions = rows.length ? await db.select().from(merchantRolePermissionsTable).where(inArray(merchantRolePermissionsTable.roleId, rows.map(row => row.roleId))) : [];
  res.json(ListAccessibleWorkspacesResponse.parse(rows.map(row => ({ id: row.merchant.id, storeName: row.merchant.storeName, currency: row.merchant.currency, role: row.role, permissions: permissions.filter(permission => permission.roleId === row.roleId).map(permission => permission.permission) }))));
});
router.get("/workspaces/current", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  try {
    const merchant = await getOrCreateMerchant(identity);
    const access = await requireTenantPermission(identity, merchant.id, "orders.read", res); if (!access) return;
    res.json(GetCurrentWorkspaceResponse.parse({ id: merchant.id, storeName: merchant.storeName, currency: merchant.currency, role: access.roleKey, permissions: [...access.permissions] }));
  } catch (error) { res.status(403).json({ error: error instanceof Error ? error.message : "Workspace unavailable" }); }
});
router.get("/team/access", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const access = await requireTenantPermission(identity, merchant.id, "orders.read", res); if (!access) return;
  res.json(GetTeamAccessResponse.parse({ merchantId: merchant.id, role: access.roleKey, permissions: [...access.permissions], locationIds: access.locationIds ? [...access.locationIds] : null }));
});
const teamLocation = (row: typeof merchantLocationsTable.$inferSelect) => ({
  id: row.id, name: row.name, locationType: row.locationType, country: row.country, currency: row.currency, timezone: row.timezone,
  address: jsonRecord(row.address), contact: jsonRecord(row.contact), isActive: row.isActive, isDefault: row.isDefault,
  supportsFulfillment: row.supportsFulfillment, supportsPos: row.supportsPos, supportsInventory: row.supportsInventory, createdAt: row.createdAt, updatedAt: row.updatedAt,
});
async function teamMembership(row: typeof merchantMembershipsTable.$inferSelect, roleKey?: string) {
  const locations = await db.select({ locationId: merchantMembershipLocationsTable.locationId }).from(merchantMembershipLocationsTable).where(eq(merchantMembershipLocationsTable.membershipId, row.id));
  const role = roleKey ? null : (await db.select({ key: merchantRolesTable.key }).from(merchantRolesTable).where(eq(merchantRolesTable.id, row.roleId)).limit(1))[0];
  return { id: row.id, clerkUserId: row.clerkUserId, roleId: row.roleId, roleKey: roleKey ?? role?.key ?? "unknown", status: row.status, locationIds: locations.map((x) => x.locationId), acceptedAt: row.acceptedAt, disabledAt: row.disabledAt, createdAt: row.createdAt, updatedAt: row.updatedAt };
}
async function teamInvitation(row: typeof merchantInvitationsTable.$inferSelect, roleKey?: string) {
  const locations = await db.select({ locationId: merchantInvitationLocationsTable.locationId }).from(merchantInvitationLocationsTable).where(eq(merchantInvitationLocationsTable.invitationId, row.id));
  const role = roleKey ? null : (await db.select({ key: merchantRolesTable.key }).from(merchantRolesTable).where(eq(merchantRolesTable.id, row.roleId)).limit(1))[0];
  return { id: row.id, email: row.email, roleId: row.roleId, roleKey: roleKey ?? role?.key ?? "unknown", locationIds: locations.map((x) => x.locationId), expiresAt: row.expiresAt, acceptedAt: row.acceptedAt, revokedAt: row.revokedAt, createdAt: row.createdAt };
}
router.get("/team/locations", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  if (!(await requireTenantPermission(identity, merchant.id, "locations.manage", res))) return;
  res.json(ListTeamLocationsResponse.parse((await db.select().from(merchantLocationsTable).where(eq(merchantLocationsTable.merchantId, merchant.id)).orderBy(asc(merchantLocationsTable.name))).map(teamLocation)));
});
router.post("/team/locations", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  if (!(await requireTenantPermission(identity, merchant.id, "locations.manage", res))) return;
  const parsed = CreateTeamLocationBody.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "Invalid location" }); return; } const body = parsed.data;
  const [location] = await db.transaction(async (tx) => {
    const existing = await tx.select({ id: merchantLocationsTable.id }).from(merchantLocationsTable).where(eq(merchantLocationsTable.merchantId, merchant.id)).limit(1);
    const makeDefault = existing.length === 0 || body.isDefault === true;
    if (makeDefault && existing.length) {
      await tx.update(merchantLocationsTable).set({ isDefault: false, updatedBy: identity.clerkUserId })
        .where(and(eq(merchantLocationsTable.merchantId, merchant.id), eq(merchantLocationsTable.isDefault, true)));
    }
    const [created] = await tx.insert(merchantLocationsTable).values({
      merchantId: merchant.id, name: body.name.trim(), country: body.country.trim().toUpperCase(), currency: body.currency.trim().toUpperCase(), timezone: body.timezone.trim(), createdBy: identity.clerkUserId, updatedBy: identity.clerkUserId,
      locationType: body.locationType ?? "store", address: body.address ?? {}, contact: body.contact ?? {},
      isDefault: makeDefault, supportsFulfillment: body.supportsFulfillment === true, supportsPos: body.supportsPos === true, supportsInventory: body.supportsInventory === true,
    }).returning();
    await emitDomainEvent(tx, { merchantId: merchant.id, eventType: "location.created", aggregateType: "location", aggregateId: created.id, actorType: "merchant", actorId: identity.clerkUserId, source: "merchant_api", idempotencyKey: `location.created:${created.id}`, payload: { locationId: created.id, name: created.name }, after: { isActive: created.isActive, isDefault: created.isDefault } });
    return [created];
  });
  res.status(201).json(CreateTeamLocationResponse.parse(teamLocation(location)));
});
router.patch("/team/locations/:id", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return; const merchant = await getOrCreateMerchant(identity); if (!(await requireTenantPermission(identity, merchant.id, "locations.manage", res))) return;
  const params = UpdateTeamLocationParams.safeParse(req.params), body = UpdateTeamLocationBody.safeParse(req.body); if (!params.success || !body.success) { res.status(400).json({ error: "Invalid location update" }); return; }
  if (body.data.isDefault !== undefined) { res.status(400).json({ error: "Use the set-default endpoint to change the default location" }); return; }
  const [updated] = await db.transaction(async tx => { const [row] = await tx.update(merchantLocationsTable).set({ ...body.data, country: body.data.country?.toUpperCase(), currency: body.data.currency?.toUpperCase(), updatedBy: identity.clerkUserId }).where(and(eq(merchantLocationsTable.id, params.data.id), eq(merchantLocationsTable.merchantId, merchant.id))).returning(); if (row) await emitDomainEvent(tx, { merchantId: merchant.id, eventType: "location.updated", aggregateType: "location", aggregateId: row.id, actorType: "merchant", actorId: identity.clerkUserId, source: "merchant_api", idempotencyKey: `location.updated:${row.id}:${row.updatedAt.getTime()}`, payload: {}, after: { isDefault: row.isDefault } }); return [row]; });
  if (!updated) { res.status(404).json({ error: "Location not found" }); return; } res.json(UpdateTeamLocationResponse.parse(teamLocation(updated)));
});
async function changeLocationFlag(req: Request, res: Response, kind: "disable" | "default") {
  const identity = await requireIdentity(req, res); if (!identity) return; const merchant = await getOrCreateMerchant(identity); if (!(await requireTenantPermission(identity, merchant.id, "locations.manage", res))) return;
  const params = (kind === "disable" ? DisableTeamLocationParams : SetDefaultTeamLocationParams).safeParse(req.params); if (!params.success) { res.status(400).json({ error: "Invalid location" }); return; }
  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM merchant_locations WHERE merchant_id = ${merchant.id} FOR UPDATE`);
    const locations = await tx.select().from(merchantLocationsTable).where(eq(merchantLocationsTable.merchantId, merchant.id));
    const target = locations.find(location => location.id === params.data.id);
    if (!target) return { error: "not_found" as const };
    if (kind === "default" && !target.isActive) return { error: "inactive" as const };
    if (kind === "disable" && target.isDefault) {
      const replacement = locations.find(location => location.id !== target.id && location.isActive);
      if (!replacement) return { error: "sole_default" as const };
      await tx.update(merchantLocationsTable).set({ isDefault: false, updatedBy: identity.clerkUserId }).where(eq(merchantLocationsTable.id, target.id));
      await tx.update(merchantLocationsTable).set({ isDefault: true, updatedBy: identity.clerkUserId }).where(eq(merchantLocationsTable.id, replacement.id));
    } else if (kind === "default") {
      await tx.update(merchantLocationsTable).set({ isDefault: false, updatedBy: identity.clerkUserId }).where(and(eq(merchantLocationsTable.merchantId, merchant.id), eq(merchantLocationsTable.isDefault, true)));
    }
    const [next] = await tx.update(merchantLocationsTable).set(kind === "disable" ? { isActive: false, isDefault: false, updatedBy: identity.clerkUserId } : { isDefault: true, updatedBy: identity.clerkUserId }).where(eq(merchantLocationsTable.id, target.id)).returning();
    await emitDomainEvent(tx, { merchantId: merchant.id, eventType: kind === "disable" ? "location.disabled" : "location.updated", aggregateType: "location", aggregateId: next.id, actorType: "merchant", actorId: identity.clerkUserId, source: "merchant_api", idempotencyKey: `location.${kind}:${next.id}:${next.updatedAt.getTime()}`, payload: {}, after: { isActive: next.isActive, isDefault: next.isDefault } });
    return { row: next };
  });
  if ("error" in result) { res.status(result.error === "not_found" ? 404 : 409).json({ error: result.error === "inactive" ? "An inactive location cannot be the default" : result.error === "sole_default" ? "The sole active default location cannot be disabled" : "Location not found" }); return; }
  res.json((kind === "disable" ? DisableTeamLocationResponse : SetDefaultTeamLocationResponse).parse(teamLocation(result.row)));
}
router.post("/team/locations/:id/disable", (req, res) => void changeLocationFlag(req, res, "disable"));
router.post("/team/locations/:id/default", (req, res) => void changeLocationFlag(req, res, "default"));
router.get("/team/roles", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  if (!(await requireTenantPermission(identity, merchant.id, "team.manage", res))) return;
  const roles = await db.select().from(merchantRolesTable).where(eq(merchantRolesTable.merchantId, merchant.id));
  const permissions = await db.select().from(merchantRolePermissionsTable).where(inArray(merchantRolePermissionsTable.roleId, roles.map((role) => role.id)));
  res.json(ListTeamRolesResponse.parse(roles.map((role) => ({ id: role.id, key: role.key, name: role.name, description: role.description, isSystem: role.isSystem, permissions: permissions.filter((permission) => permission.roleId === role.id).map((permission) => permission.permission) }))));
});
router.post("/team/invitations", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  if (!(await requireTenantPermission(identity, merchant.id, "team.manage", res))) return;
  const parsed = CreateTeamInvitationBody.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "Invalid invitation" }); return; }
  const { roleId, locationIds } = parsed.data; const email = parsed.data.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !roleId || !(await validateTenantLocations(merchant.id, locationIds))) { res.status(400).json({ error: "A valid email, tenant role, and tenant locations are required" }); return; }
  const role = (await db.select().from(merchantRolesTable).where(and(eq(merchantRolesTable.id, roleId), eq(merchantRolesTable.merchantId, merchant.id))).limit(1))[0];
  if (!role || role.key === "owner") { res.status(400).json({ error: "Owner role cannot be assigned by invitation" }); return; }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  try {
    const invitation = await db.transaction(async (tx) => {
      // The partial unique index treats expired rows as active. Close expired
      // invitations before issuing a replacement rather than relying on an
      // exception or silently retaining a usable-looking stale link.
      const stale = await tx.select().from(merchantInvitationsTable).where(and(
        eq(merchantInvitationsTable.merchantId, merchant.id),
        eq(merchantInvitationsTable.email, email),
        isNull(merchantInvitationsTable.acceptedAt),
        isNull(merchantInvitationsTable.revokedAt),
        lt(merchantInvitationsTable.expiresAt, new Date()),
      ));
      for (const expired of stale) {
        await tx.update(merchantInvitationsTable).set({ revokedAt: new Date() }).where(eq(merchantInvitationsTable.id, expired.id));
        await emitDomainEvent(tx, { merchantId: merchant.id, eventType: "invitation.revoked", aggregateType: "invitation", aggregateId: expired.id, actorType: "merchant", actorId: identity.clerkUserId, source: "merchant_api", idempotencyKey: `invitation.expired:${expired.id}`, payload: { reason: "expired" }, after: {} });
      }
      const [created] = await tx.insert(merchantInvitationsTable).values({ merchantId: merchant.id, email, roleId, tokenHash, invitedBy: identity.clerkUserId, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000) }).returning();
      if (locationIds.length) await tx.insert(merchantInvitationLocationsTable).values(locationIds.map((locationId) => ({ invitationId: created.id, locationId })));
      await emitDomainEvent(tx, { merchantId: merchant.id, eventType: "invitation.created", aggregateType: "invitation", aggregateId: created.id, actorType: "merchant", actorId: identity.clerkUserId, source: "merchant_api", idempotencyKey: `invitation.created:${created.id}`, payload: { invitationId: created.id, email }, after: { roleId } });
      return created;
    });
    // There is no email transport configured. The bearer URL is intentionally
    // returned exactly once and is never persisted.
    res.status(201).json(CreateTeamInvitationResponse.parse({ ...(await teamInvitation(invitation, role.key)), inviteUrl: `/invite/${token}`, delivery: "copy_link_required" }));
  } catch { res.status(409).json({ error: "An active invitation already exists for this email" }); }
});
router.get("/team/memberships", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return; const merchant = await getOrCreateMerchant(identity); if (!(await requireTenantPermission(identity, merchant.id, "team.manage", res))) return;
  const rows = await db.select({ membership: merchantMembershipsTable, roleKey: merchantRolesTable.key }).from(merchantMembershipsTable).innerJoin(merchantRolesTable, eq(merchantMembershipsTable.roleId, merchantRolesTable.id)).where(eq(merchantMembershipsTable.merchantId, merchant.id));
  res.json(ListTeamMembershipsResponse.parse(await Promise.all(rows.map(x => teamMembership(x.membership, x.roleKey)))));
});
router.patch("/team/memberships/:id", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return; const merchant = await getOrCreateMerchant(identity); if (!(await requireTenantPermission(identity, merchant.id, "team.manage", res))) return;
  const params = UpdateTeamMembershipParams.safeParse(req.params), body = UpdateTeamMembershipBody.safeParse(req.body); if (!params.success || !body.success || !(await validateTenantLocations(merchant.id, body.success ? body.data.locationIds : []))) { res.status(400).json({ error: "Invalid membership update" }); return; }
  const result = await db.transaction(async tx => { const target = (await tx.select({ membership: merchantMembershipsTable, roleKey: merchantRolesTable.key }).from(merchantMembershipsTable).innerJoin(merchantRolesTable, eq(merchantMembershipsTable.roleId, merchantRolesTable.id)).where(and(eq(merchantMembershipsTable.id, params.data.id), eq(merchantMembershipsTable.merchantId, merchant.id))).limit(1))[0]; const role = (await tx.select().from(merchantRolesTable).where(and(eq(merchantRolesTable.id, body.data.roleId), eq(merchantRolesTable.merchantId, merchant.id))).limit(1))[0]; if (!target || !role || target.roleKey === "owner" || role.key === "owner") return null; const [updated] = await tx.update(merchantMembershipsTable).set({ roleId: role.id }).where(eq(merchantMembershipsTable.id, target.membership.id)).returning(); await tx.delete(merchantMembershipLocationsTable).where(eq(merchantMembershipLocationsTable.membershipId, updated.id)); if (body.data.locationIds.length) await tx.insert(merchantMembershipLocationsTable).values(body.data.locationIds.map(locationId => ({ membershipId: updated.id, locationId }))); await emitDomainEvent(tx, { merchantId: merchant.id, eventType: "membership.role_changed", aggregateType: "membership", aggregateId: updated.id, actorType: "merchant", actorId: identity.clerkUserId, source: "merchant_api", idempotencyKey: `membership.updated:${updated.id}:${updated.updatedAt.getTime()}`, payload: {}, after: { roleId: role.id, locationIds: body.data.locationIds } }); return { updated, roleKey: role.key }; });
  if (!result) { res.status(404).json({ error: "Membership or role not found, or owner is protected" }); return; } res.json(UpdateTeamMembershipResponse.parse(await teamMembership(result.updated, result.roleKey)));
});
router.post("/team/memberships/:id/disable", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return; const merchant = await getOrCreateMerchant(identity); if (!(await requireTenantPermission(identity, merchant.id, "team.manage", res))) return; const params = DisableTeamMembershipParams.safeParse(req.params); if (!params.success) { res.status(400).json({ error: "Invalid membership" }); return; }
  const result = await db.transaction(async tx => { const target = (await tx.select({ membership: merchantMembershipsTable, roleKey: merchantRolesTable.key }).from(merchantMembershipsTable).innerJoin(merchantRolesTable, eq(merchantMembershipsTable.roleId, merchantRolesTable.id)).where(and(eq(merchantMembershipsTable.id, params.data.id), eq(merchantMembershipsTable.merchantId, merchant.id))).limit(1))[0]; if (!target || target.roleKey === "owner") return null; const [updated] = await tx.update(merchantMembershipsTable).set({ status: "disabled", disabledAt: new Date() }).where(eq(merchantMembershipsTable.id, target.membership.id)).returning(); await emitDomainEvent(tx, { merchantId: merchant.id, eventType: "membership.status_changed", aggregateType: "membership", aggregateId: updated.id, actorType: "merchant", actorId: identity.clerkUserId, source: "merchant_api", idempotencyKey: `membership.disabled:${updated.id}`, payload: {}, after: { status: "disabled" } }); return teamMembership(updated, target.roleKey); }); if (!result) { res.status(404).json({ error: "Membership not found or owner is protected" }); return; } res.json(DisableTeamMembershipResponse.parse(result));
});
router.get("/team/invitations", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return; const merchant = await getOrCreateMerchant(identity); if (!(await requireTenantPermission(identity, merchant.id, "team.manage", res))) return;
  const rows = await db.select({ invitation: merchantInvitationsTable, roleKey: merchantRolesTable.key }).from(merchantInvitationsTable).innerJoin(merchantRolesTable, eq(merchantInvitationsTable.roleId, merchantRolesTable.id)).where(eq(merchantInvitationsTable.merchantId, merchant.id)); res.json(ListTeamInvitationsResponse.parse(await Promise.all(rows.map(x => teamInvitation(x.invitation, x.roleKey)))));
});
router.post("/team/invitations/:id/revoke", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return; const merchant = await getOrCreateMerchant(identity); if (!(await requireTenantPermission(identity, merchant.id, "team.manage", res))) return; const params = RevokeTeamInvitationParams.safeParse(req.params); if (!params.success) { res.status(400).json({ error: "Invalid invitation" }); return; }
  const row = await db.transaction(async tx => { const [updated] = await tx.update(merchantInvitationsTable).set({ revokedAt: new Date() }).where(and(eq(merchantInvitationsTable.id, params.data.id), eq(merchantInvitationsTable.merchantId, merchant.id), isNull(merchantInvitationsTable.acceptedAt), isNull(merchantInvitationsTable.revokedAt))).returning(); if (updated) await emitDomainEvent(tx, { merchantId: merchant.id, eventType: "invitation.revoked", aggregateType: "invitation", aggregateId: updated.id, actorType: "merchant", actorId: identity.clerkUserId, source: "merchant_api", idempotencyKey: `invitation.revoked:${updated.id}`, payload: {}, after: { revokedAt: updated.revokedAt?.toISOString() } }); return updated; }); if (!row) { res.status(404).json({ error: "Active invitation not found" }); return; } res.json(RevokeTeamInvitationResponse.parse(await teamInvitation(row)));
});
router.post("/team/invitations/:id/rotate-link", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return; const merchant = await getOrCreateMerchant(identity); if (!(await requireTenantPermission(identity, merchant.id, "team.manage", res))) return; const params = RotateTeamInvitationLinkParams.safeParse(req.params); if (!params.success) { res.status(400).json({ error: "Invalid invitation" }); return; } const token = randomBytes(32).toString("base64url");
  const row = await db.transaction(async tx => { const [updated] = await tx.update(merchantInvitationsTable).set({ tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000) }).where(and(eq(merchantInvitationsTable.id, params.data.id), eq(merchantInvitationsTable.merchantId, merchant.id), isNull(merchantInvitationsTable.acceptedAt), isNull(merchantInvitationsTable.revokedAt))).returning(); if (updated) await emitDomainEvent(tx, { merchantId: merchant.id, eventType: "invitation.revoked", aggregateType: "invitation", aggregateId: updated.id, actorType: "merchant", actorId: identity.clerkUserId, source: "merchant_api", idempotencyKey: `invitation.rotated:${updated.id}:${updated.updatedAt.getTime()}`, payload: { reason: "link_rotated" }, after: {} }); return updated; }); if (!row) { res.status(404).json({ error: "Active invitation not found" }); return; } res.json(RotateTeamInvitationLinkResponse.parse({ ...(await teamInvitation(row)), inviteUrl: `/invite/${token}`, delivery: "copy_link_required" }));
});
router.get("/public/invitations/:token", async (req, res): Promise<void> => {
  res.setHeader("Referrer-Policy", "no-referrer");
  const params = GetPublicInvitationPreviewParams.safeParse(req.params); if (!params.success) { res.status(404).json({ error: "Invitation not found" }); return; } const hash = createHash("sha256").update(params.data.token).digest("hex");
  const row = (await db.select({ invitation: merchantInvitationsTable, merchantName: merchantsTable.storeName, roleName: merchantRolesTable.name }).from(merchantInvitationsTable).innerJoin(merchantsTable, eq(merchantInvitationsTable.merchantId, merchantsTable.id)).innerJoin(merchantRolesTable, eq(merchantInvitationsTable.roleId, merchantRolesTable.id)).where(eq(merchantInvitationsTable.tokenHash, hash)).limit(1))[0];
  if (!row) { res.status(404).json({ error: "Invitation not found" }); return; } const status = row.invitation.acceptedAt ? "accepted" : row.invitation.revokedAt ? "revoked" : row.invitation.expiresAt <= new Date() ? "expired" : "active"; res.json(GetPublicInvitationPreviewResponse.parse({ merchantName: row.merchantName, roleName: row.roleName, expiresAt: row.invitation.expiresAt, status }));
});
router.post("/invitations/accept", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return; const parsed = AcceptTeamInvitationBody.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "Invalid invitation token" }); return; } const hash = createHash("sha256").update(parsed.data.token).digest("hex");
  try {
    const membership = await db.transaction(async tx => { const row = (await tx.select({ invitation: merchantInvitationsTable, role: merchantRolesTable }).from(merchantInvitationsTable).innerJoin(merchantRolesTable, eq(merchantInvitationsTable.roleId, merchantRolesTable.id)).where(eq(merchantInvitationsTable.tokenHash, hash)).limit(1))[0]; if (!row || row.invitation.revokedAt || row.invitation.acceptedAt || row.invitation.expiresAt <= new Date() || !identity.verifiedEmails.has(row.invitation.email) || row.role.merchantId !== row.invitation.merchantId || row.role.key === "owner") throw new Error("invalid_invitation"); const [claimed] = await tx.update(merchantInvitationsTable).set({ acceptedAt: new Date(), acceptedBy: identity.clerkUserId }).where(and(eq(merchantInvitationsTable.id, row.invitation.id), isNull(merchantInvitationsTable.acceptedAt), isNull(merchantInvitationsTable.revokedAt), eq(merchantInvitationsTable.tokenHash, hash))).returning(); if (!claimed) throw new Error("invalid_invitation"); const existing = (await tx.select().from(merchantMembershipsTable).where(and(eq(merchantMembershipsTable.merchantId, claimed.merchantId), eq(merchantMembershipsTable.clerkUserId, identity.clerkUserId))).limit(1))[0]; if (existing?.status === "active") throw new Error("membership_exists"); const [member] = existing ? await tx.update(merchantMembershipsTable).set({ roleId: claimed.roleId, status: "active", acceptedAt: new Date(), disabledAt: null }).where(eq(merchantMembershipsTable.id, existing.id)).returning() : await tx.insert(merchantMembershipsTable).values({ merchantId: claimed.merchantId, clerkUserId: identity.clerkUserId, roleId: claimed.roleId, status: "active", acceptedAt: new Date(), invitedBy: claimed.invitedBy }).returning(); const scopes = await tx.select({ locationId: merchantInvitationLocationsTable.locationId }).from(merchantInvitationLocationsTable).innerJoin(merchantLocationsTable, eq(merchantInvitationLocationsTable.locationId, merchantLocationsTable.id)).where(and(eq(merchantInvitationLocationsTable.invitationId, claimed.id), eq(merchantLocationsTable.merchantId, claimed.merchantId))); await tx.delete(merchantMembershipLocationsTable).where(eq(merchantMembershipLocationsTable.membershipId, member.id)); if (scopes.length) await tx.insert(merchantMembershipLocationsTable).values(scopes.map(x => ({ membershipId: member.id, locationId: x.locationId }))); await emitDomainEvent(tx, { merchantId: claimed.merchantId, eventType: "invitation.accepted", aggregateType: "invitation", aggregateId: claimed.id, actorType: "staff", actorId: identity.clerkUserId, source: "merchant_api", idempotencyKey: `invitation.accepted:${claimed.id}`, payload: { membershipId: member.id }, after: {} }); return { member, roleKey: row.role.key }; }); res.json(AcceptTeamInvitationResponse.parse(await teamMembership(membership.member, membership.roleKey)));
  } catch (error) { res.status(409).json({ error: error instanceof Error && error.message === "membership_exists" ? "You already have an active membership" : "Invitation cannot be accepted" }); }
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
  const access = await requireTenantPermission(identity, merchant.id, "orders.manage", res); if (!access) return;
  const location = await resolveOrderLocation(merchant.id, access, (parsed.data as { locationId?: string }).locationId);
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
          locationId: location.id,
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
      await emitDomainEvent(tx, {
        merchantId: merchant.id, eventType: "order.created", aggregateType: "order",
        aggregateId: order.id, actorType: "merchant", actorId: identity.clerkUserId,
        source: "merchant_api", idempotencyKey: `order:${order.id}:created`,
        payload: { orderNumber: order.orderNumber, status: order.status, currency: order.currency, total: order.total },
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
  const access = await requireTenantPermission(identity, merchant.id, "orders.manage", res); if (!access) return;
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
      if (!existing || !(await requireLocationScope(access, existing.order.locationId))) throw new Error("Order not found");
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
        await emitDomainEvent(tx, {
          merchantId: merchant.id, eventType: "order.cancelled", aggregateType: "order",
          aggregateId: order.id, actorType: "merchant", actorId: identity.clerkUserId,
          source: "merchant_api", idempotencyKey: `order:${order.id}:cancelled`,
          payload: { orderNumber: order.orderNumber, status: order.status },
          before: { status: existing.order.status }, after: { status: order.status },
        });
        if (reservation) {
          await emitDomainEvent(tx, {
            merchantId: merchant.id, eventType: "inventory.released", aggregateType: "inventory_reservation",
            aggregateId: reservation.id, actorType: "merchant", actorId: identity.clerkUserId,
            source: "merchant_api", idempotencyKey: `inventory-reservation:${reservation.id}:released`,
            payload: { orderId: order.id, supplierProductId: reservation.supplierProductId, quantity: reservation.quantity },
          });
        }
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

router.get("/payment-links", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const links = await db
    .select()
    .from(paymentLinksTable)
    .where(eq(paymentLinksTable.merchantId, merchant.id))
    .orderBy(desc(paymentLinksTable.createdAt));
  res.json(ListPaymentLinksResponse.parse(links.map(serializePaymentLink)));
});

router.get("/invoices", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const access = await requireTenantPermission(identity, merchant.id, "finance.read", res); if (!access) return;
  const invoices = await db.select().from(invoicesTable).where(and(eq(invoicesTable.merchantId, merchant.id), access.locationIds ? inArray(invoicesTable.locationId, [...access.locationIds]) : undefined)).orderBy(desc(invoicesTable.createdAt));
  res.json(ListInvoicesResponse.parse(await Promise.all((await Promise.all(invoices.map(refreshInvoiceOverdue))).map(serializeInvoice))));
});

router.post("/invoices", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter a customer, currency, and at least one valid line item" }); return; }
  const merchant = await getOrCreateMerchant(identity);
  const access = await requireTenantPermission(identity, merchant.id, "finance.manage", res); if (!access) return;
  const location = await resolveOrderLocation(merchant.id, access, (parsed.data as { locationId?: string }).locationId);
  const input = parsed.data; const currency = input.currency.trim().toUpperCase();
  if (currency !== merchant.currency) { res.status(400).json({ error: `Invoices must use your merchant currency (${merchant.currency})` }); return; }
  try {
    const invoice = await db.transaction(async (tx) => {
      if (input.customerId) {
        const customer = (await tx.select({ id: customersTable.id }).from(customersTable).where(and(eq(customersTable.id, input.customerId), eq(customersTable.merchantId, merchant.id))).limit(1))[0];
        if (!customer) throw new Error("Customer does not belong to this merchant");
      }
      if (input.orderId) {
        const order = (await tx.select({ id: ordersTable.id, currency: ordersTable.currency }).from(ordersTable).where(and(eq(ordersTable.id, input.orderId), eq(ordersTable.merchantId, merchant.id))).limit(1))[0];
        if (!order || order.currency !== currency) throw new Error("Linked order must belong to you and use the invoice currency");
      }
      if (input.paymentLinkId) {
        const link = (await tx.select({ id: paymentLinksTable.id, currency: paymentLinksTable.currency }).from(paymentLinksTable).where(and(eq(paymentLinksTable.id, input.paymentLinkId), eq(paymentLinksTable.merchantId, merchant.id))).limit(1))[0];
        if (!link || link.currency !== currency) throw new Error("Linked payment link must belong to you and use the invoice currency");
      }
      const lineValues = input.lines.map((line, position) => {
        const canonical = canonicalInvoiceLine(Number(line.quantity), Number(line.unitPrice));
        return { position, description: line.description.trim(), ...canonical };
      });
      const subtotalMinor = lineValues.reduce((sum, line) => sum + line.lineTotalMinor, 0);
      const discountMinor = canonicalMoneyMinor(input.discountAmount ?? 0, "Discount");
      const taxMinor = canonicalMoneyMinor(input.taxAmount ?? 0, "Tax"); const shippingMinor = canonicalMoneyMinor(input.shippingAmount ?? 0, "Shipping");
      if (discountMinor > subtotalMinor) throw new Error("Discount cannot exceed the invoice subtotal");
      const totalMinor = subtotalMinor - discountMinor + taxMinor + shippingMinor;
      const [created] = await tx.insert(invoicesTable).values({
        merchantId: merchant.id, locationId: location.id, customerId: input.customerId ?? null, orderId: input.orderId ?? null, paymentLinkId: input.paymentLinkId ?? null,
        invoiceNumber: `INV-${randomUUID().slice(0, 8).toUpperCase()}`, publicToken: randomUUID().replaceAll("-", ""),
        customerName: input.customerName.trim(), customerEmail: input.customerEmail.trim().toLowerCase(), customerPhone: input.customerPhone?.trim() || null,
        billingAddress: input.billingAddress?.trim() ? { formatted: input.billingAddress.trim() } : null, shippingAddress: input.shippingAddress?.trim() ? { formatted: input.shippingAddress.trim() } : null,
        currency, subtotal: (subtotalMinor / 100).toFixed(2), discountAmount: (discountMinor / 100).toFixed(2), taxAmount: (taxMinor / 100).toFixed(2), shippingAmount: (shippingMinor / 100).toFixed(2), total: (totalMinor / 100).toFixed(2),
        dueDate: input.dueDate ? new Date(input.dueDate).toISOString().slice(0, 10) : null, notes: input.notes?.trim() || null, terms: input.terms?.trim() || null,
      }).returning();
      if (!created) throw new Error("Invoice could not be created");
      await tx.insert(invoiceLinesTable).values(lineValues.map((line) => ({ invoiceId: created.id, position: line.position, description: line.description, quantity: (line.quantityMilli / 1000).toFixed(3), unitPrice: (line.unitPriceMinor / 100).toFixed(2), lineTotal: (line.lineTotalMinor / 100).toFixed(2) })));
      return created;
    });
    res.status(201).json(CreateInvoiceResponse.parse(await serializeInvoice(invoice)));
  } catch (error) { req.log.error({ err: error }, "invoice creation failed"); res.status(409).json({ error: error instanceof Error ? error.message : "Invoice could not be created" }); }
});

router.get("/invoices/:id", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const params = GetInvoiceParams.safeParse(req.params); if (!params.success) { res.status(400).json({ error: "Invalid invoice" }); return; }
  const merchant = await getOrCreateMerchant(identity);
  const access = await requireTenantPermission(identity, merchant.id, "finance.read", res); if (!access) return;
  const invoice = (await db.select().from(invoicesTable).where(and(eq(invoicesTable.id, params.data.id), eq(invoicesTable.merchantId, merchant.id))).limit(1))[0];
  if (!invoice || !(await requireLocationScope(access, invoice.locationId))) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(GetInvoiceResponse.parse(await serializeInvoice(invoice)));
});

router.get("/invoices/:id/context", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const params = GetInvoiceContextParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid invoice" }); return; }
  const merchant = await getOrCreateMerchant(identity);
  const access = await requireTenantPermission(identity, merchant.id, "finance.read", res); if (!access) return;
  const invoice = (await db.select().from(invoicesTable).where(and(eq(invoicesTable.id, params.data.id), eq(invoicesTable.merchantId, merchant.id))).limit(1))[0];
  if (!invoice || !(await requireLocationScope(access, invoice.locationId))) { res.status(404).json({ error: "Invoice not found" }); return; }
  const [lines, customer, order, submissions, ledgerEntries, events] = await Promise.all([
    db.select().from(invoiceLinesTable).where(eq(invoiceLinesTable.invoiceId, invoice.id)).orderBy(asc(invoiceLinesTable.position)),
    invoice.customerId ? db.select().from(customersTable).where(and(eq(customersTable.id, invoice.customerId), eq(customersTable.merchantId, merchant.id))).limit(1) : Promise.resolve([]),
    invoice.orderId ? db.select().from(ordersTable).where(and(eq(ordersTable.id, invoice.orderId), eq(ordersTable.merchantId, merchant.id))).limit(1) : Promise.resolve([]),
    db.select().from(invoicePaymentSubmissionsTable).where(and(eq(invoicePaymentSubmissionsTable.invoiceId, invoice.id), eq(invoicePaymentSubmissionsTable.merchantId, merchant.id))).orderBy(desc(invoicePaymentSubmissionsTable.createdAt)),
    db.select().from(ledgerEntriesTable).where(and(eq(ledgerEntriesTable.invoiceId, invoice.id), eq(ledgerEntriesTable.merchantId, merchant.id))),
    db.select().from(domainEventsTable).where(eq(domainEventsTable.merchantId, merchant.id)).orderBy(desc(domainEventsTable.occurredAt)).limit(200),
  ]);
  const submissionIds = submissions.map((submission) => submission.id);
  const [intents, records] = await Promise.all([
    submissionIds.length ? db.select().from(paymentIntentsTable).where(and(eq(paymentIntentsTable.merchantId, merchant.id), inArray(paymentIntentsTable.invoicePaymentSubmissionId, submissionIds))) : Promise.resolve([]),
    submissionIds.length ? db.select().from(paymentRecordsTable).where(and(eq(paymentRecordsTable.merchantId, merchant.id), inArray(paymentRecordsTable.invoicePaymentSubmissionId, submissionIds))) : Promise.resolve([]),
  ]);
  const nextActions: Array<{ action: string; target: string }> = [];
  if (invoice.status === "draft" && access.permissions.has("finance.manage")) nextActions.push({ action: "send_invoice", target: `/invoices/${invoice.id}/send` });
  if (["draft", "sent", "viewed", "overdue"].includes(invoice.status) && toNumber(invoice.amountPaid) === 0 && access.permissions.has("finance.manage")) nextActions.push({ action: "void_invoice", target: `/invoices/${invoice.id}/void` });
  if (submissions.some((submission) => submission.status === "pending_review") && access.permissions.has("payments.verify")) nextActions.push({ action: "review_invoice_payment", target: `/invoices/${invoice.id}/payments/${submissions.find((submission) => submission.status === "pending_review")!.id}/verify` });
  res.json(GetInvoiceContextResponse.parse({
    invoice: contextRecord(invoice.id, `/invoices/${invoice.id}`, invoice),
    lines: lines.map((line) => contextRecord(line.id, `/invoices/${invoice.id}/lines/${line.id}`, line)),
    customer: customer[0] ? contextRecord(customer[0].id, `/customers/${customer[0].id}`, customer[0]) : null,
    order: order[0] ? contextRecord(order[0].id, `/orders/${order[0].id}`, order[0]) : null,
    submissions: submissions.map((item) => contextRecord(item.id, `/invoices/${invoice.id}/payments/${item.id}`, item)),
    paymentIntents: intents.map((item) => contextRecord(item.id, `/payments/${item.id}`, item)),
    paymentRecords: records.map((item) => contextRecord(item.id, `/payments/${item.intentId}`, item)),
    ledgerEntries: ledgerEntries.map((item) => contextRecord(item.id, `/ledger/${item.id}`, item)),
    events: contextEvents(events.filter((event) => event.aggregateId === String(invoice.id)
      || (event.aggregateType === "payment_intent" && intents.some((item) => item.id === Number(event.aggregateId)))
      || (event.aggregateType === "payment_record" && records.some((item) => item.id === Number(event.aggregateId))))),
    impact: contextImpact(invoice.currency, minorFromDecimal(invoice.total), records, [], ledgerEntries),
    nextActions,
  }));
});

router.post("/invoices/:id/send", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return; const params = SendInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid invoice" }); return; } const merchant = await getOrCreateMerchant(identity); const access = await requireTenantPermission(identity, merchant.id, "finance.manage", res); if (!access) return;
  const current = (await db.select().from(invoicesTable).where(and(eq(invoicesTable.id, params.data.id), eq(invoicesTable.merchantId, merchant.id))).limit(1))[0];
  if (!current || !(await requireLocationScope(access, current.locationId))) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (current.status !== "draft") { res.status(409).json({ error: "Only draft invoices can be sent" }); return; }
  const invoice = await db.transaction(async (tx) => {
    const [updated] = await tx.update(invoicesTable).set({ status: "sent", sentAt: new Date() }).where(and(eq(invoicesTable.id, current.id), eq(invoicesTable.status, "draft"))).returning();
    if (!updated) throw new Error("Invoice status changed while sending");
    await emitDomainEvent(tx, {
      merchantId: merchant.id, eventType: "invoice.sent", aggregateType: "invoice",
      aggregateId: updated.id, actorType: "merchant", actorId: identity.clerkUserId,
      source: "merchant_api", idempotencyKey: `invoice:${updated.id}:sent`,
      payload: { invoiceNumber: updated.invoiceNumber, status: updated.status, currency: updated.currency, total: updated.total },
      before: { status: current.status }, after: { status: updated.status },
    });
    return updated;
  });
  res.json(SendInvoiceResponse.parse(await serializeInvoice(invoice!)));
});

router.post("/invoices/:id/void", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return; const params = VoidInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid invoice" }); return; } const merchant = await getOrCreateMerchant(identity); const access = await requireTenantPermission(identity, merchant.id, "finance.manage", res); if (!access) return;
  try {
    const invoice = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from ${invoicesTable} where id=${params.data.id} and merchant_id=${merchant.id} for update`);
      const current = (await tx.select().from(invoicesTable).where(and(eq(invoicesTable.id, params.data.id), eq(invoicesTable.merchantId, merchant.id))).limit(1))[0];
       if (!current || !(await requireLocationScope(access, current.locationId))) throw new Error("Invoice not found");
      if (current.status === "void") return current;
      if (toNumber(current.amountPaid) > 0 || current.status === "paid") throw new Error("Invoices with verified payments cannot be voided");
      const [updated] = await tx.update(invoicesTable).set({ status: "void", voidedAt: new Date() })
        .where(and(eq(invoicesTable.id, current.id), eq(invoicesTable.status, current.status), eq(invoicesTable.amountPaid, current.amountPaid))).returning();
      if (!updated) throw new Error("Invoice changed while it was being voided");
      return updated;
    });
    res.json(VoidInvoiceResponse.parse(await serializeInvoice(invoice)));
  } catch (error) { res.status(error instanceof Error && error.message === "Invoice not found" ? 404 : 409).json({ error: error instanceof Error ? error.message : "Invoice could not be voided" }); }
});

router.post("/payment-links", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = CreatePaymentLinkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a title, amount, and valid currency" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const currency = parsed.data.currency.trim().toUpperCase();
  if (currency !== merchant.currency) {
    res.status(400).json({ error: `Payment links must use your merchant currency (${merchant.currency})` });
    return;
  }
  try {
    const [link] = await db.insert(paymentLinksTable).values({
      merchantId: merchant.id,
      token: randomUUID().replaceAll("-", ""),
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      amount: parsed.data.amount.toFixed(2),
      currency,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    }).returning();
    if (!link) throw new Error("Payment link could not be created");
    await db.insert(activityTable).values({
      merchantId: merchant.id,
      type: "payment_link_created",
      title: `Payment link created: ${link.title}`,
      description: `A ${link.currency} ${toNumber(link.amount).toFixed(2)} fixed-price checkout link is ready to share.`,
      amount: link.amount,
      currency: link.currency,
      tone: "positive",
    });
    res.status(201).json(CreatePaymentLinkResponse.parse(serializePaymentLink(link)));
  } catch (error) {
    req.log.error({ err: error }, "payment link creation failed");
    res.status(409).json({ error: "Payment link could not be created" });
  }
});

router.patch("/payment-links/:id", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const params = UpdatePaymentLinkParams.safeParse(req.params);
  const parsed = UpdatePaymentLinkBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Choose active or archived" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const [link] = await db.update(paymentLinksTable)
    .set({ status: parsed.data.status })
    .where(and(eq(paymentLinksTable.id, params.data.id), eq(paymentLinksTable.merchantId, merchant.id)))
    .returning();
  if (!link) {
    res.status(404).json({ error: "Payment link not found" });
    return;
  }
  res.json(UpdatePaymentLinkResponse.parse(serializePaymentLink(link)));
});

router.get("/marketplace/management", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  let [monthlyRecord] = await db.select().from(marketplaceBillingRecordsTable)
    .where(and(eq(marketplaceBillingRecordsTable.merchantId, merchant.id), eq(marketplaceBillingRecordsTable.kind, "monthly")))
    .orderBy(desc(marketplaceBillingRecordsTable.createdAt))
    .limit(1);
  const monthlyActive = monthlyRecord?.status === "paid" &&
    monthlyRecord.paidAt !== null &&
    Date.now() - monthlyRecord.paidAt.getTime() < MARKETPLACE_BILLING_DAYS * 86400000;
  if (!monthlyRecord || (monthlyRecord.status === "paid" && !monthlyActive)) {
    [monthlyRecord] = await db.insert(marketplaceBillingRecordsTable).values({
      merchantId: merchant.id,
      kind: "monthly",
      amount: MARKETPLACE_MONTHLY_FEE.toFixed(2),
      currency: merchant.currency,
      status: "due",
    }).returning();
  }
  const [listingRows, billing] = await Promise.all([
    db.select({ listing: marketplaceListingsTable, product: supplierProductsTable })
      .from(marketplaceListingsTable)
      .innerJoin(supplierProductsTable, eq(marketplaceListingsTable.supplierProductId, supplierProductsTable.id))
      .where(eq(marketplaceListingsTable.merchantId, merchant.id))
      .orderBy(desc(marketplaceListingsTable.createdAt)),
    db.select().from(marketplaceBillingRecordsTable)
      .where(eq(marketplaceBillingRecordsTable.merchantId, merchant.id))
      .orderBy(desc(marketplaceBillingRecordsTable.createdAt)),
  ]);
  res.json(GetMarketplaceManagementResponse.parse({
    listings: listingRows.map(({ listing, product }) => serializeMarketplaceListing(listing, product)),
    billing: billing.map(serializeMarketplaceBilling),
    monthlyFee: {
      amount: MARKETPLACE_MONTHLY_FEE,
      currency: merchant.currency,
      status: monthlyRecord?.status === "paid" && monthlyRecord.paidAt !== null && Date.now() - monthlyRecord.paidAt.getTime() < MARKETPLACE_BILLING_DAYS * 86400000 ? "paid" : monthlyRecord?.status ?? "due",
    },
  }));
});

router.post("/marketplace/listings", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = CreateMarketplaceListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a published product to submit" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const product = (await db.select().from(supplierProductsTable)
    .where(and(
      eq(supplierProductsTable.id, parsed.data.supplierProductId),
      eq(supplierProductsTable.merchantId, merchant.id),
      eq(supplierProductsTable.status, "active"),
      eq(supplierProductsTable.visibility, "active"),
      sql`${supplierProductsTable.sellingPrice} is not null`,
    )).limit(1))[0];
  if (!product) {
    res.status(409).json({ error: "Only published, priced products can enter the marketplace" });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [listing] = await tx.insert(marketplaceListingsTable).values({
        merchantId: merchant.id,
        supplierProductId: product.id,
        listingFeeCurrency: merchant.currency,
      }).onConflictDoUpdate({
        target: [marketplaceListingsTable.merchantId, marketplaceListingsTable.supplierProductId],
        set: { status: "pending", reviewNote: null, listingFeeStatus: "due", updatedAt: new Date() },
      }).returning();
      if (!listing) throw new Error("Marketplace listing could not be created");
      await tx.insert(activityTable).values({
        merchantId: merchant.id,
        type: "marketplace_listing_submitted",
        title: `Marketplace listing submitted: ${product.title}`,
        description: "The listing is pending review. It becomes publicly visible only while the merchant's $5 monthly participation subscription is paid.",
        currency: merchant.currency,
        tone: "neutral",
      });
      return listing;
    });
    res.status(201).json(CreateMarketplaceListingResponse.parse(serializeMarketplaceListing(result, product)));
  } catch (error) {
    req.log.error({ err: error }, "marketplace listing creation failed");
    res.status(409).json({ error: "Marketplace listing already exists or could not be created" });
  }
});

router.patch("/marketplace/listings/:id", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const params = UpdateMarketplaceListingParams.safeParse(req.params);
  const parsed = UpdateMarketplaceListingBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Choose paused or removed" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const [updated] = await db.update(marketplaceListingsTable)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(and(eq(marketplaceListingsTable.id, params.data.id), eq(marketplaceListingsTable.merchantId, merchant.id)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Marketplace listing not found" });
    return;
  }
  const product = (await db.select().from(supplierProductsTable).where(eq(supplierProductsTable.id, updated.supplierProductId)).limit(1))[0];
  if (!product) {
    res.status(404).json({ error: "Marketplace product not found" });
    return;
  }
  res.json(UpdateMarketplaceListingResponse.parse(serializeMarketplaceListing(updated, product)));
});

router.post("/marketplace/billing/:id/submit", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const params = SubmitMarketplaceBillingParams.safeParse(req.params);
  const parsed = SubmitMarketplaceBillingBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "A payment reference is required" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const [record] = await db.update(marketplaceBillingRecordsTable)
    .set({ paymentReference: parsed.data.paymentReference.trim(), status: "submitted" })
    .where(and(eq(marketplaceBillingRecordsTable.id, params.data.id), eq(marketplaceBillingRecordsTable.merchantId, merchant.id), eq(marketplaceBillingRecordsTable.status, "due")))
    .returning();
  if (!record) {
    res.status(404).json({ error: "Due marketplace fee not found" });
    return;
  }
  if (record.listingId) {
    await db.update(marketplaceListingsTable).set({ listingFeeStatus: "submitted", updatedAt: new Date() })
      .where(and(eq(marketplaceListingsTable.id, record.listingId), eq(marketplaceListingsTable.merchantId, merchant.id)));
  }
  res.json(SubmitMarketplaceBillingResponse.parse(serializeMarketplaceBilling(record)));
});

router.patch("/admin/marketplace/listings/:id/review", async (req, res): Promise<void> => {
  const identity = await requireAdmin(req, res);
  if (!identity) return;
  const params = ReviewMarketplaceListingParams.safeParse(req.params);
  const parsed = ReviewMarketplaceListingBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Choose a valid listing review state" });
    return;
  }
  const [updated] = await db.transaction(async (tx) => {
    const [reviewed] = await tx.update(marketplaceListingsTable)
    .set({
      status: parsed.data.status,
      reviewNote: parsed.data.reviewNote ?? null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(marketplaceListingsTable.id, params.data.id))
    .returning();
    if (reviewed) await emitDomainEvent(tx, { merchantId: reviewed.merchantId, eventType: "marketplace.listing_reviewed", aggregateType: "marketplace_listing", aggregateId: reviewed.id, actorType: "admin", actorId: identity.clerkUserId, source: "admin_api", idempotencyKey: `marketplace-listing:${reviewed.id}:reviewed:${reviewed.updatedAt.toISOString()}`, payload: { status: reviewed.status, listingFeeStatus: reviewed.listingFeeStatus } });
    return [reviewed];
  });
  if (!updated) {
    res.status(404).json({ error: "Marketplace listing not found" });
    return;
  }
  const product = (await db.select().from(supplierProductsTable).where(eq(supplierProductsTable.id, updated.supplierProductId)).limit(1))[0];
  if (!product) {
    res.status(404).json({ error: "Marketplace product not found" });
    return;
  }
  res.json(ReviewMarketplaceListingResponse.parse(serializeMarketplaceListing(updated, product)));
});

router.get("/admin/marketplace/listings", async (req, res): Promise<void> => {
  const identity = await requireAdmin(req, res);
  if (!identity) return;
  const rows = await db
    .select({
      listing: marketplaceListingsTable,
      productTitle: supplierProductsTable.title,
      merchantName: merchantsTable.storeName,
      paymentReference: marketplaceBillingRecordsTable.paymentReference,
    })
    .from(marketplaceListingsTable)
    .innerJoin(supplierProductsTable, eq(marketplaceListingsTable.supplierProductId, supplierProductsTable.id))
    .innerJoin(merchantsTable, eq(marketplaceListingsTable.merchantId, merchantsTable.id))
    .leftJoin(marketplaceBillingRecordsTable, and(
      eq(marketplaceBillingRecordsTable.listingId, marketplaceListingsTable.id),
      eq(marketplaceBillingRecordsTable.kind, "listing"),
    ))
    .orderBy(desc(marketplaceListingsTable.createdAt))
    .limit(100);
  res.json(ListMarketplaceAdminQueueResponse.parse(rows.map(({ listing, productTitle, merchantName, paymentReference }) => ({
    id: listing.id,
    merchantId: listing.merchantId,
    merchantName: merchantName || "Independent merchant",
    productTitle,
    status: listing.status,
    reviewNote: listing.reviewNote,
    listingFeeAmount: toNumber(listing.listingFeeAmount),
    listingFeeCurrency: listing.listingFeeCurrency,
    listingFeeStatus: listing.listingFeeStatus,
    paymentReference: paymentReference ?? null,
    createdAt: listing.createdAt.toISOString(),
  }))));
});

router.patch("/admin/marketplace/billing/:id/review", async (req, res): Promise<void> => {
  const identity = await requireAdmin(req, res);
  if (!identity) return;
  const params = ReviewMarketplaceBillingParams.safeParse(req.params);
  const parsed = ReviewMarketplaceBillingBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Choose paid or rejected" });
    return;
  }
  const [updated] = await db.transaction(async (tx) => {
    const [reviewed] = await tx.update(marketplaceBillingRecordsTable)
    .set({
      status: parsed.data.status,
      reviewNote: parsed.data.reviewNote ?? null,
      paidAt: parsed.data.status === "paid" ? new Date() : null,
    })
    .where(and(eq(marketplaceBillingRecordsTable.id, params.data.id), eq(marketplaceBillingRecordsTable.status, "submitted")))
    .returning();
    if (!reviewed) return [reviewed];
    if (reviewed.listingId) {
      await tx.update(marketplaceListingsTable)
        .set({ listingFeeStatus: reviewed.status, updatedAt: new Date() })
        .where(eq(marketplaceListingsTable.id, reviewed.listingId));
    }
    await emitDomainEvent(tx, { merchantId: reviewed.merchantId, eventType: "marketplace.fee_reviewed", aggregateType: "marketplace_billing", aggregateId: reviewed.id, actorType: "admin", actorId: identity.clerkUserId, source: "admin_api", idempotencyKey: `marketplace-billing:${reviewed.id}:reviewed:${reviewed.paidAt?.toISOString() ?? "rejected"}:${reviewed.reviewNote ?? ""}`, payload: { listingId: reviewed.listingId, status: reviewed.status, amount: reviewed.amount, currency: reviewed.currency } });
    return [reviewed];
  });
  if (!updated) {
    res.status(404).json({ error: "Marketplace billing record not found" });
    return;
  }
  res.json(ReviewMarketplaceBillingResponse.parse(serializeMarketplaceBilling(updated)));
});

router.get("/admin/marketing/payments", async (req, res): Promise<void> => {
  const identity = await requireAdmin(req, res);
  if (!identity) return;
  const rows = await db
    .select({
      payment: advertisingPaymentsTable,
      merchantName: merchantsTable.name,
      campaignTitle: aiActionsTable.title,
    })
    .from(advertisingPaymentsTable)
    .innerJoin(
      merchantsTable,
      eq(advertisingPaymentsTable.merchantId, merchantsTable.id),
    )
    .innerJoin(
      aiActionsTable,
      eq(advertisingPaymentsTable.aiActionId, aiActionsTable.id),
    )
    .orderBy(desc(advertisingPaymentsTable.createdAt))
    .limit(100);
  res.json(
    ListAdminAdvertisingPaymentsResponse.parse(
      rows.map(({ payment, merchantName, campaignTitle }) => ({
        ...serializeAdvertisingPayment(payment),
        merchantId: payment.merchantId,
        merchantName,
        campaignTitle,
      })),
    ),
  );
});

router.patch(
  "/admin/marketing/payments/:id/review",
  async (req, res): Promise<void> => {
    const identity = await requireAdmin(req, res);
    if (!identity) return;
    const params = ReviewAdvertisingPaymentParams.safeParse(req.params);
    const body = ReviewAdvertisingPaymentBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid advertising payment review" });
      return;
    }
    try {
      const payment = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select id from ${advertisingPaymentsTable} where id = ${params.data.id} for update`,
        );
        const current = (
          await tx
            .select()
            .from(advertisingPaymentsTable)
            .where(eq(advertisingPaymentsTable.id, params.data.id))
            .limit(1)
        )[0];
        if (!current) throw new Error("Advertising payment not found");
        if (current.status === body.data.status) return current;
        if (current.status !== "pending_review") {
          throw new Error("This advertising payment already has a final review");
        }
        const [updated] = await tx
          .update(advertisingPaymentsTable)
          .set({
            status: body.data.status,
            reviewedBy: identity.clerkUserId,
            reviewNote: body.data.reviewNote?.trim() || null,
            reviewedAt: new Date(),
            paidAt: body.data.status === "confirmed" ? new Date() : null,
          })
          .where(
            and(
              eq(advertisingPaymentsTable.id, current.id),
              eq(advertisingPaymentsTable.status, "pending_review"),
            ),
          )
          .returning();
        if (!updated) throw new Error("Advertising payment changed during review");
        await tx.insert(activityTable).values({
          merchantId: updated.merchantId,
          type: "advertising_payment_reviewed",
          title:
            updated.status === "confirmed"
              ? "Advertising payment verified"
              : "Advertising payment rejected",
          description: updated.paymentReference ?? `Campaign ${updated.aiActionId}`,
          amount: updated.amount,
          currency: updated.currency,
          tone: updated.status === "confirmed" ? "positive" : "warning",
        });
        await emitDomainEvent(tx, {
          merchantId: updated.merchantId,
          eventType: "advertising.payment_reviewed",
          aggregateType: "advertising_payment",
          aggregateId: updated.id,
          actorType: "admin",
          actorId: identity.clerkUserId,
          source: "admin_api",
          idempotencyKey: `advertising-payment:${updated.id}:reviewed:${updated.status}`,
          payload: {
            aiActionId: updated.aiActionId,
            status: updated.status,
            amount: updated.amount,
            currency: updated.currency,
          },
        });
        return updated;
      });
      res.json(
        ReviewAdvertisingPaymentResponse.parse(
          serializeAdvertisingPayment(payment),
        ),
      );
    } catch (error) {
      req.log.error({ err: error }, "advertising payment review failed");
      res.status(409).json({
        error:
          error instanceof Error
            ? error.message
            : "Advertising payment review failed",
      });
    }
  },
);

function serializeAuctionBid(bid: typeof auctionBidsTable.$inferSelect) {
  return {
    id: bid.id,
    auctionId: bid.auctionId,
    bidderName: bid.bidderName,
    amount: toNumber(bid.amount),
    createdAt: bid.createdAt,
  };
}

function serializeAuction(
  auction: typeof auctionListingsTable.$inferSelect,
  merchantName: string,
  bids: typeof auctionBidsTable.$inferSelect[],
) {
  const currentBid = bids.length ? toNumber(bids[0]!.amount) : null;
  const status =
    auction.status === "active" && auction.endsAt <= new Date()
      ? "ended"
      : auction.status;
  return {
    id: auction.id,
    merchantName: merchantName || "Independent merchant",
    supplierProductId: auction.supplierProductId,
    title: auction.title,
    description: auction.description,
    imageUrl: auction.imageUrl,
    currency: auction.currency,
    startingPrice: toNumber(auction.startingPrice),
    currentBid,
    bidCount: bids.length,
    startsAt: auction.startsAt,
    endsAt: auction.endsAt,
    status,
    bids: bids.map(serializeAuctionBid),
  };
}

router.get("/auctions", async (req, res): Promise<void> => {
  const parsed = ListAuctionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid auction search" });
    return;
  }
  const now = new Date();
  const search = parsed.data.search?.trim() ?? "";
  const filters = [
    eq(auctionListingsTable.status, "active"),
    sql`${auctionListingsTable.startsAt} <= ${now}`,
    sql`${auctionListingsTable.endsAt} > ${now}`,
  ];
  if (search) {
    filters.push(
      sql`(${auctionListingsTable.title} ilike ${`%${search}%`} or coalesce(${auctionListingsTable.description}, '') ilike ${`%${search}%`})`,
    );
  }
  const rows = await db
    .select({
      auction: auctionListingsTable,
      merchantName: merchantsTable.storeName,
    })
    .from(auctionListingsTable)
    .innerJoin(merchantsTable, eq(auctionListingsTable.merchantId, merchantsTable.id))
    .where(and(...filters))
    .orderBy(asc(auctionListingsTable.endsAt))
    .limit(100);
  const result = await Promise.all(
    rows.map(async ({ auction, merchantName }) => {
      const bids = await db
        .select()
        .from(auctionBidsTable)
        .where(eq(auctionBidsTable.auctionId, auction.id))
        .orderBy(desc(auctionBidsTable.amount), desc(auctionBidsTable.createdAt))
        .limit(100);
      return serializeAuction(auction, merchantName, bids);
    }),
  );
  res.json(ListAuctionsResponse.parse(result));
});

router.get("/auctions/:id", async (req, res): Promise<void> => {
  const parsed = GetAuctionParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid auction" });
    return;
  }
  const row = (
    await db
      .select({
        auction: auctionListingsTable,
        merchantName: merchantsTable.storeName,
      })
      .from(auctionListingsTable)
      .innerJoin(merchantsTable, eq(auctionListingsTable.merchantId, merchantsTable.id))
      .where(eq(auctionListingsTable.id, parsed.data.id))
      .limit(1)
  )[0];
  if (!row || row.auction.status === "cancelled") {
    res.status(404).json({ error: "Auction not found" });
    return;
  }
  const bids = await db
    .select()
    .from(auctionBidsTable)
    .where(eq(auctionBidsTable.auctionId, row.auction.id))
    .orderBy(desc(auctionBidsTable.amount), desc(auctionBidsTable.createdAt))
    .limit(100);
  res.json(GetAuctionResponse.parse(serializeAuction(row.auction, row.merchantName, bids)));
});

router.post("/auctions/:id/bids", async (req, res): Promise<void> => {
  const params = PlaceAuctionBidParams.safeParse(req.params);
  const parsed = PlaceAuctionBidBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Enter a valid name, email, and bid amount" });
    return;
  }
  try {
    const bid = await db.transaction(async (tx) => {
      const auction = (
        await tx
          .select()
          .from(auctionListingsTable)
          .where(eq(auctionListingsTable.id, params.data.id))
          .limit(1)
      )[0];
      if (!auction || auction.status !== "active" || auction.startsAt > new Date() || auction.endsAt <= new Date()) {
        throw new Error("This auction is no longer accepting bids");
      }
      const [highest] = await tx
        .select({ amount: auctionBidsTable.amount })
        .from(auctionBidsTable)
        .where(eq(auctionBidsTable.auctionId, auction.id))
        .orderBy(desc(auctionBidsTable.amount))
        .limit(1);
      const minimum = highest ? toNumber(highest.amount) : toNumber(auction.startingPrice);
      if (parsed.data.amount <= minimum) {
        throw new Error(`Your bid must be higher than ${minimum.toFixed(2)}`);
      }
      const [created] = await tx
        .insert(auctionBidsTable)
        .values({
          auctionId: auction.id,
          bidderName: parsed.data.bidderName.trim(),
          bidderEmail: parsed.data.bidderEmail.toLowerCase(),
          amount: parsed.data.amount.toFixed(2),
        })
        .returning();
      if (!created) throw new Error("Bid could not be saved");
      return created;
    });
    res.status(201).json(PlaceAuctionBidResponse.parse(serializeAuctionBid(bid)));
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : "Bid could not be placed",
    });
  }
});

router.get("/merchant/auctions", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  try {
    const merchant = await getOrCreateMerchant(identity);
    const rows = await db
      .select()
      .from(auctionListingsTable)
      .where(eq(auctionListingsTable.merchantId, merchant.id))
      .orderBy(desc(auctionListingsTable.createdAt));
    const result = await Promise.all(
      rows.map(async (auction) => {
        const bids = await db
          .select()
          .from(auctionBidsTable)
          .where(eq(auctionBidsTable.auctionId, auction.id))
          .orderBy(desc(auctionBidsTable.amount), desc(auctionBidsTable.createdAt))
          .limit(100);
        return serializeAuction(auction, merchant.storeName, bids);
      }),
    );
    res.json(ListMerchantAuctionsResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error }, "Could not list merchant auctions");
    res.status(500).json({ error: "Auction workspace could not be loaded" });
  }
});

router.post("/auctions", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = CreateAuctionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a product, starting price, and future end time" });
    return;
  }
  try {
    const merchant = await getOrCreateMerchant(identity);
    const product = (
      await db
        .select()
        .from(supplierProductsTable)
        .where(
          and(
            eq(supplierProductsTable.id, parsed.data.supplierProductId),
            eq(supplierProductsTable.merchantId, merchant.id),
            eq(supplierProductsTable.status, "active"),
            eq(supplierProductsTable.visibility, "active"),
          ),
        )
        .limit(1)
    )[0];
    if (!product || product.sellingPrice === null) {
      res.status(422).json({ error: "Only an active, published product with a selling price can be auctioned" });
      return;
    }
    if (parsed.data.endsAt <= new Date(Date.now() + 5 * 60 * 1000)) {
      res.status(422).json({ error: "Auctions must run for at least five minutes" });
      return;
    }
    if (parsed.data.reservePrice !== null && parsed.data.reservePrice !== undefined && parsed.data.reservePrice < parsed.data.startingPrice) {
      res.status(422).json({ error: "The reserve price cannot be below the starting price" });
      return;
    }
    const [auction] = await db
      .insert(auctionListingsTable)
      .values({
        merchantId: merchant.id,
        supplierProductId: product.id,
        title: product.title,
        description: product.description,
        imageUrl: product.imageUrl,
        currency: product.currency,
        startingPrice: parsed.data.startingPrice.toFixed(2),
        reservePrice: parsed.data.reservePrice == null ? null : parsed.data.reservePrice.toFixed(2),
        endsAt: parsed.data.endsAt,
      })
      .returning();
    if (!auction) throw new Error("Auction could not be created");
    await db.insert(activityTable).values({
      merchantId: merchant.id,
      type: "auction_created",
      title: `Auction created: ${auction.title}`,
      description: `Customer bidding is open until ${auction.endsAt.toISOString()}.`,
      currency: auction.currency,
      tone: "neutral",
    });
    res.status(201).json(
      CreateAuctionResponse.parse(serializeAuction(auction, merchant.storeName, [])),
    );
  } catch (error) {
    req.log.error({ err: error }, "Could not create auction");
    res.status(422).json({ error: error instanceof Error ? error.message : "Auction could not be created" });
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
    eq(marketplaceListingsTable.status, "approved"),
    exists(
      db.select({ id: marketplaceBillingRecordsTable.id })
        .from(marketplaceBillingRecordsTable)
        .where(and(
          eq(marketplaceBillingRecordsTable.merchantId, merchantsTable.id),
          eq(marketplaceBillingRecordsTable.kind, "monthly"),
          eq(marketplaceBillingRecordsTable.status, "paid"),
          gte(marketplaceBillingRecordsTable.paidAt, new Date(Date.now() - MARKETPLACE_BILLING_DAYS * 86400000)),
        )),
    ),
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
    .leftJoin(marketplaceListingsTable, eq(marketplaceListingsTable.supplierProductId, supplierProductsTable.id))
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
      storeDescription: merchant.storeDescription,
      storeContactEmail: merchant.storeContactEmail,
      storePhone: merchant.storePhone,
      storeWebsite: merchant.storeWebsite,
      storeAddress: merchant.storeAddress,
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
      const location = await resolveOrderLocation(merchant.id, null, null, true);
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
            locationId: location.id,
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
        const [reservation] = await tx.insert(inventoryReservationsTable).values({
          merchantId: merchant.id,
          locationId: order.locationId,
          supplierProductId: product.id,
          orderId: order.id,
          quantity,
          status: "reserved",
          expiresAt,
        }).returning();
        if (!reservation) throw new Error("Inventory reservation could not be created");
        await tx.insert(activityTable).values({
          merchantId: merchant.id,
          type: "checkout_submitted",
          title: `Checkout ${order.orderNumber} received`,
          description: `${customer.name} submitted a ${quantity} item order awaiting payment confirmation.`,
          amount: total.toFixed(2),
          currency: product.currency,
          tone: "neutral",
        });
        await emitDomainEvent(tx, {
          merchantId: merchant.id, eventType: "order.created", aggregateType: "order", aggregateId: order.id,
          actorType: "customer", source: "public_checkout", idempotencyKey: `order:${order.id}:created`,
          payload: { orderNumber: order.orderNumber, status: order.status, currency: order.currency, total: order.total },
        });
        await emitDomainEvent(tx, {
          merchantId: merchant.id, eventType: "inventory.reserved", aggregateType: "inventory_reservation", aggregateId: reservation.id,
          actorType: "customer", source: "public_checkout", idempotencyKey: `inventory-reservation:${reservation.id}:reserved`,
          payload: { orderId: order.id, supplierProductId: product.id, quantity: reservation.quantity, expiresAt: reservation.expiresAt.toISOString() },
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

router.get("/public/payment-links/:token", async (req, res): Promise<void> => {
  const params = GetPublicPaymentLinkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid payment link" });
    return;
  }
  const link = (await db.select().from(paymentLinksTable).where(eq(paymentLinksTable.token, params.data.token)).limit(1))[0];
  if (!link || link.status !== "active" || (link.expiresAt !== null && link.expiresAt <= new Date())) {
    res.status(404).json({ error: "Payment link is unavailable" });
    return;
  }
  res.json(GetPublicPaymentLinkResponse.parse(serializePublicPaymentLink(link)));
});

router.post("/public/payment-links/:token/checkout", async (req, res): Promise<void> => {
  const params = CreatePaymentLinkCheckoutParams.safeParse(req.params);
  const parsed = CreatePaymentLinkCheckoutBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Enter valid customer and shipping details" });
    return;
  }
  const link = (await db.select().from(paymentLinksTable).where(eq(paymentLinksTable.token, params.data.token)).limit(1))[0];
  if (!link || link.status !== "active" || (link.expiresAt !== null && link.expiresAt <= new Date())) {
    res.status(404).json({ error: "Payment link is unavailable" });
    return;
  }
  const location = await resolveOrderLocation(link.merchantId, null, null, true);
  try {
    const result = await db.transaction(async (tx) => {
      const replay = (await tx.select({ order: ordersTable }).from(ordersTable).where(and(eq(ordersTable.merchantId, link.merchantId), eq(ordersTable.idempotencyKey, parsed.data.idempotencyKey))).limit(1))[0];
      if (replay) return replay.order;
      const email = parsed.data.customerEmail.trim().toLowerCase();
      let customer = (await tx.select().from(customersTable).where(and(eq(customersTable.merchantId, link.merchantId), eq(customersTable.email, email))).limit(1))[0];
      if (customer) {
        [customer] = await tx.update(customersTable).set({
          name: parsed.data.customerName.trim(),
          phone: parsed.data.customerPhone?.trim() || null,
          ...(parsed.data.marketingConsent === undefined ? {} : {
            marketingConsent: parsed.data.marketingConsent,
            consentCapturedAt: parsed.data.marketingConsent ? (customer.consentCapturedAt ?? new Date()) : null,
          }),
        }).where(eq(customersTable.id, customer.id)).returning();
      } else {
        [customer] = await tx.insert(customersTable).values({
          merchantId: link.merchantId,
          name: parsed.data.customerName.trim(),
          email,
          phone: parsed.data.customerPhone?.trim() || null,
          marketingConsent: parsed.data.marketingConsent ?? false,
          consentCapturedAt: parsed.data.marketingConsent ? new Date() : null,
        }).returning();
      }
      if (!customer) throw new Error("Customer could not be saved");
      const amount = toNumber(link.amount);
      const [order] = await tx.insert(ordersTable).values({
        merchantId: link.merchantId,
        locationId: location.id,
        customerId: customer.id,
        orderNumber: `LINK-${randomUUID().slice(0, 8).toUpperCase()}`,
        subtotal: amount.toFixed(2),
        taxAmount: "0.00",
        shippingAmount: "0.00",
        total: amount.toFixed(2),
        quantity: 1,
        currency: link.currency,
        status: "pending",
        supplierProductId: null,
        shippingAddress: parsed.data.shippingAddress.trim(),
        fulfillmentStatus: "not_required",
        idempotencyKey: parsed.data.idempotencyKey,
      }).onConflictDoNothing({ target: [ordersTable.merchantId, ordersTable.idempotencyKey] }).returning();
      if (!order) {
        const existing = (await tx.select({ order: ordersTable }).from(ordersTable).where(and(eq(ordersTable.merchantId, link.merchantId), eq(ordersTable.idempotencyKey, parsed.data.idempotencyKey))).limit(1))[0];
        if (existing) return existing.order;
        throw new Error("Payment link order could not be created");
      }
      await tx.insert(activityTable).values({
        merchantId: link.merchantId,
        type: "payment_link_checkout_submitted",
        title: `Payment link order ${order.orderNumber} received`,
        description: `${customer.name} submitted a fixed-price order awaiting payment confirmation.`,
        amount: link.amount,
        currency: link.currency,
        tone: "positive",
      });
      await emitDomainEvent(tx, {
        merchantId: link.merchantId, eventType: "order.created", aggregateType: "order", aggregateId: order.id,
        actorType: "customer", source: "public_checkout", idempotencyKey: `order:${order.id}:created`,
        payload: { orderNumber: order.orderNumber, status: order.status, currency: order.currency, total: order.total, channel: "payment_link" },
      });
      return order;
    });
    res.status(201).json(CreatePaymentLinkCheckoutResponse.parse({
      orderNumber: result.orderNumber,
      title: link.title,
      subtotal: toNumber(result.subtotal),
      tax: toNumber(result.taxAmount),
      shipping: toNumber(result.shippingAmount),
      total: toNumber(result.total),
      currency: result.currency,
      status: "pending",
      paymentMessage: "Order received. Payment is not captured online; the merchant will confirm payment before fulfillment.",
    }));
  } catch (error) {
    req.log.error({ err: error }, "payment link checkout failed");
    res.status(409).json({ error: error instanceof Error ? error.message : "Payment link checkout could not be created" });
  }
});

router.get("/public/invoices/:token", async (req, res): Promise<void> => {
  const params = GetPublicInvoiceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid invoice link" }); return; }
  let invoice = (await db.select().from(invoicesTable).where(eq(invoicesTable.publicToken, params.data.token)).limit(1))[0];
  if (!invoice || invoice.status === "draft") { res.status(404).json({ error: "Invoice is unavailable" }); return; }
  invoice = await refreshInvoiceOverdue(invoice);
  if (invoice.status === "sent") {
    const [viewed] = await db.update(invoicesTable).set({ status: "viewed", viewedAt: new Date() })
      .where(and(eq(invoicesTable.id, invoice.id), eq(invoicesTable.status, "sent"))).returning();
    // A concurrent void/overdue transition wins; never manufacture "viewed".
    invoice = viewed ?? (await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoice!.id)).limit(1))[0]!;
  }
  const detail = await serializeInvoice(invoice);
  // Deliberately omit merchant identifiers, email, payment submissions, and addresses.
  res.json(GetPublicInvoiceResponse.parse({
    invoiceNumber: detail.invoiceNumber, customerName: detail.customerName, currency: detail.currency,
    subtotal: detail.subtotal, discountAmount: detail.discountAmount, taxAmount: detail.taxAmount,
    shippingAmount: detail.shippingAmount, total: detail.total, amountPaid: detail.amountPaid,
    dueDate: detail.dueDate, status: detail.status, notes: detail.notes, terms: detail.terms, lines: detail.lines,
  }));
});

router.post("/public/invoices/:token/payment-reference", async (req, res): Promise<void> => {
  const params = SubmitInvoicePaymentReferenceParams.safeParse(req.params); const body = SubmitInvoicePaymentReferenceBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Enter a valid amount and payment reference" }); return; }
  let invoice = (await db.select().from(invoicesTable).where(eq(invoicesTable.publicToken, params.data.token)).limit(1))[0];
  if (invoice) invoice = await refreshInvoiceOverdue(invoice);
  if (!invoice || !["sent", "viewed", "partially_paid", "overdue"].includes(invoice.status)) { res.status(404).json({ error: "Invoice is not accepting payment references" }); return; }
  const outstanding = toNumber(invoice.total) - toNumber(invoice.amountPaid);
  if (body.data.amount > outstanding) { res.status(400).json({ error: "Submitted amount exceeds the outstanding balance" }); return; }
  try {
    const submission = await db.transaction(async (tx) => {
      const [created] = await tx.insert(invoicePaymentSubmissionsTable).values({
        invoiceId: invoice.id, merchantId: invoice.merchantId, amount: body.data.amount.toFixed(2), currency: invoice.currency,
        paymentReference: body.data.paymentReference.trim(), senderName: body.data.senderName?.trim() || null,
      }).returning();
      if (!created) throw new Error("Payment reference could not be saved");
      await tx.update(invoicesTable).set({ paymentReference: created.paymentReference }).where(eq(invoicesTable.id, invoice.id));
      await emitDomainEvent(tx, {
        merchantId: invoice.merchantId, eventType: "invoice.payment_submitted", aggregateType: "invoice",
        aggregateId: invoice.id, actorType: "customer", source: "public_checkout",
        idempotencyKey: `invoice-payment-submission:${created.id}`,
        payload: { invoiceId: invoice.id, submissionId: created.id, amount: created.amount, currency: created.currency },
      });
      return created;
    });
    res.status(201).json(SubmitInvoicePaymentReferenceResponse.parse(serializeInvoicePayment(submission)));
  } catch (error) { res.status(409).json({ error: "This payment reference was already submitted" }); }
});

router.post("/invoices/:id/payments/:paymentId/verify", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const params = VerifyInvoicePaymentParams.safeParse(req.params); const body = VerifyInvoicePaymentBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid invoice payment review" }); return; }
  const merchant = await getOrCreateMerchant(identity);
  try {
    const invoice = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from ${invoicesTable} where id=${params.data.id} and merchant_id=${merchant.id} for update`);
      await tx.execute(sql`select id from ${invoicePaymentSubmissionsTable} where id=${params.data.paymentId} and invoice_id=${params.data.id} and merchant_id=${merchant.id} for update`);
      const current = (await tx.select().from(invoicesTable).where(and(eq(invoicesTable.id, params.data.id), eq(invoicesTable.merchantId, merchant.id))).limit(1))[0];
      if (!current) throw new Error("Invoice not found");
      const payment = (await tx.select().from(invoicePaymentSubmissionsTable).where(and(eq(invoicePaymentSubmissionsTable.id, params.data.paymentId), eq(invoicePaymentSubmissionsTable.invoiceId, current.id), eq(invoicePaymentSubmissionsTable.merchantId, merchant.id))).limit(1))[0];
      if (!payment || payment.status !== "pending_review") throw new Error("Payment submission is not awaiting review");
      if (!["sent", "viewed", "partially_paid", "overdue"].includes(current.status)) throw new Error("Invoice is not accepting payment verification");
      if (!body.data.approved) {
        const [rejected] = await tx.update(invoicePaymentSubmissionsTable).set({ status: "rejected", reviewedBy: identity.clerkUserId, reviewedAt: new Date(), reviewNote: body.data.reviewNote ?? null }).where(and(eq(invoicePaymentSubmissionsTable.id, payment.id), eq(invoicePaymentSubmissionsTable.status, "pending_review"))).returning();
        if (!rejected) throw new Error("Payment submission changed during review");
        return current;
      }
      const paid = Number((toNumber(current.amountPaid) + toNumber(payment.amount)).toFixed(2));
      if (paid > toNumber(current.total)) throw new Error("Verified amount exceeds invoice total");
      const status = paid === toNumber(current.total) ? "paid" : "partially_paid";
      const [verified] = await tx.update(invoicePaymentSubmissionsTable).set({ status: "verified", reviewedBy: identity.clerkUserId, reviewedAt: new Date(), reviewNote: body.data.reviewNote ?? null }).where(and(eq(invoicePaymentSubmissionsTable.id, payment.id), eq(invoicePaymentSubmissionsTable.status, "pending_review"))).returning();
      if (!verified) throw new Error("Payment submission changed during review");
      const [intent] = await tx.insert(paymentIntentsTable).values({ merchantId: merchant.id, orderId: null, invoicePaymentSubmissionId: payment.id, amountMinor: Math.round(toNumber(payment.amount) * 100), currency: current.currency, method: "invoice_payment_reference", status: "verified", evidenceReference: payment.paymentReference, idempotencyKey: `invoice:${payment.id}` }).onConflictDoNothing({ target: paymentIntentsTable.invoicePaymentSubmissionId }).returning();
      if (!intent) throw new Error("Authoritative invoice payment already exists");
      const [record] = await tx.insert(paymentRecordsTable).values({ intentId: intent.id, merchantId: merchant.id, orderId: null, invoicePaymentSubmissionId: payment.id, amountMinor: intent.amountMinor, currency: current.currency, method: intent.method, status: "verified", evidenceReference: payment.paymentReference, verifiedBy: identity.clerkUserId, verifiedAt: new Date() }).returning();
      if (!record) throw new Error("Authoritative invoice payment record could not be created");
      await tx.insert(ledgerEntriesTable).values({ merchantId: merchant.id, invoiceId: current.id, paymentRecordId: record.id, amountMinor: intent.amountMinor, currency: current.currency, entryType: "sale", referenceKey: `invoice-payment:${payment.id}` });
      await tx.execute(sql`select id from ${subscriptionsTable} where merchant_id=${merchant.id} for update`);
      const subscription = (await tx.select().from(subscriptionsTable).where(eq(subscriptionsTable.merchantId, merchant.id)).limit(1))[0];
      if (subscription) {
        const outstanding = Math.max(0, toNumber(subscription.amountDue) - toNumber(subscription.amountPaid));
        const hold = Math.min(toNumber(payment.amount), Math.max(0, outstanding - toNumber(subscription.earningsHeld)));
        if (hold > 0) {
          const [held] = await tx.update(subscriptionsTable).set({ earningsHeld: (toNumber(subscription.earningsHeld) + hold).toFixed(2) }).where(and(eq(subscriptionsTable.id, subscription.id), eq(subscriptionsTable.amountPaid, subscription.amountPaid), eq(subscriptionsTable.earningsHeld, subscription.earningsHeld))).returning();
          if (!held) throw new Error("Subscription changed while invoice payment was being verified");
        }
      }
      const [updated] = await tx.update(invoicesTable).set({ amountPaid: paid.toFixed(2), status }).where(and(eq(invoicesTable.id, current.id), eq(invoicesTable.status, current.status), eq(invoicesTable.amountPaid, current.amountPaid))).returning();
      if (!updated) throw new Error("Invoice changed during payment verification");
      await tx.insert(activityTable).values({ merchantId: merchant.id, type: "invoice_payment_verified", title: `Invoice ${current.invoiceNumber} payment verified`, description: "Verified customer payment evidence was posted to the internal ledger.", amount: payment.amount, currency: current.currency, tone: "positive" });
      await emitDomainEvent(tx, {
        merchantId: merchant.id, eventType: "invoice.payment_verified", aggregateType: "invoice",
        aggregateId: updated.id, actorType: "merchant", actorId: identity.clerkUserId, source: "merchant_api",
        idempotencyKey: `invoice-payment:${payment.id}:verified`,
        payload: { invoiceId: updated.id, submissionId: payment.id, amountMinor: intent.amountMinor, currency: intent.currency },
        before: { status: current.status, amountPaid: current.amountPaid }, after: { status: updated.status, amountPaid: updated.amountPaid },
      });
      return updated!;
    });
    res.json(VerifyInvoicePaymentResponse.parse(await serializeInvoice(invoice)));
  } catch (error) { req.log.error({ err: error }, "invoice payment review failed"); res.status(409).json({ error: error instanceof Error ? error.message : "Invoice payment review failed" }); }
});

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
        currency: currentSubscription.currency,
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
      currency: currentSubscription.currency,
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

router.post("/subscription/whop-checkout", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  if (identity.isAdmin) {
    res.status(409).json({ error: "Master admin account is subscription exempt" });
    return;
  }
  if (!isWhopConfigured()) {
    res.status(503).json({ error: "Whop hosted checkout is not configured yet" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  if (merchant.status === "banned") {
    res.status(403).json({ error: "Banned accounts cannot submit subscription payments" });
    return;
  }
  const enforced = await enforceSubscription(merchant, identity.isAdmin);
  const outstanding = Math.max(
    0,
    toNumber(enforced.subscription.amountDue) -
      toNumber(enforced.subscription.amountPaid),
  );
  if (outstanding === 0) {
    res.status(409).json({ error: "Subscription is already settled" });
    return;
  }
  if (enforced.subscription.currency !== "USD") {
    res.status(409).json({
      error: "Whop checkout is currently available for USD billing only. Use Pay from bank or Pay from dashboard for another currency.",
    });
    return;
  }
  const reference = `WHOP-SUB-${enforced.subscription.id}`;
  let payment = (
    await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.merchantId, merchant.id),
          eq(paymentsTable.reference, reference),
        ),
      )
      .limit(1)
  )[0];
  if (payment?.status === "confirmed") {
    res.status(409).json({ error: "This subscription is already settled through Whop" });
    return;
  }
  if (payment?.evidenceReference && payment.status !== "failed") {
    try {
      const checkout = await whopRequest<WhopCheckoutConfiguration>(
        `/api/v1/checkout_configurations/${encodeURIComponent(payment.evidenceReference)}`,
      );
      if (checkout.purchase_url) {
        res.json({
          provider: "whop",
          checkoutId: checkout.id,
          purchaseUrl: checkout.purchase_url,
          status: payment.status,
          amount: toNumber(payment.amount),
          currency: payment.currency,
        });
        return;
      }
    } catch (error) {
      req.log.warn({ err: error }, "Could not reuse the existing Whop checkout");
    }
  }

  if (!payment) {
    [payment] = await db
      .insert(paymentsTable)
      .values({
        merchantId: merchant.id,
        amount: outstanding.toFixed(2),
        currency: "USD",
        method: "whop",
        reference,
        status: "pending",
      })
      .onConflictDoNothing()
      .returning();
    if (!payment) {
      payment = (
        await db
          .select()
          .from(paymentsTable)
          .where(eq(paymentsTable.reference, reference))
          .limit(1)
      )[0];
    }
  } else {
    [payment] = await db
      .update(paymentsTable)
      .set({
        amount: outstanding.toFixed(2),
        currency: "USD",
        status: "pending",
        reviewNote: null,
        reviewedAt: null,
      })
      .where(
        and(
          eq(paymentsTable.id, payment.id),
          eq(paymentsTable.status, "failed"),
        ),
      )
      .returning();
  }
  if (!payment) {
    res.status(409).json({ error: "Could not reserve the Whop payment attempt" });
    return;
  }

  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto === "https" ? "https" : req.protocol;
  const host = req.get("host");
  if (!host) {
    res.status(500).json({ error: "The checkout return address could not be determined" });
    return;
  }
  const redirectUrl = new URL(
    `/billing?whop=return&checkout_id=${encodeURIComponent(reference)}`,
    `${protocol}://${host}`,
  ).toString();
  try {
    const checkout = await whopRequest<WhopCheckoutConfiguration>(
      "/api/v1/checkout_configurations",
      {
        method: "POST",
        body: {
          plan_id: whopPlanId(),
          redirect_url: redirectUrl,
          metadata: {
            provider: "ts-commerce",
            merchant_id: String(merchant.id),
            subscription_id: String(enforced.subscription.id),
            payment_reference: reference,
          },
        },
      },
    );
    if (!checkout.id || !checkout.purchase_url) {
      throw new Error("Whop returned an incomplete hosted checkout");
    }
    const [updatedPayment] = await db
      .update(paymentsTable)
      .set({
        evidenceReference: checkout.id,
        status: "under_review",
        reviewNote: "Awaiting server-side Whop payment verification",
      })
      .where(eq(paymentsTable.id, payment.id))
      .returning();
    if (!updatedPayment) throw new Error("Could not save the Whop checkout reference");
    await addActivity(merchant.id, {
      type: "whop_checkout_created",
      title: "Whop checkout opened",
      description: "A hosted Whop checkout is waiting for verified payment.",
      amount: outstanding.toFixed(2),
      currency: "USD",
      tone: "neutral",
    });
    res.status(201).json({
      provider: "whop",
      checkoutId: checkout.id,
      purchaseUrl: checkout.purchase_url,
      status: updatedPayment.status,
      amount: outstanding,
      currency: "USD",
    });
  } catch (error) {
    await db
      .update(paymentsTable)
      .set({
        status: "failed",
        reviewNote: error instanceof Error ? error.message : "Whop checkout could not be created",
      })
      .where(eq(paymentsTable.id, payment.id));
    res.status(502).json({
      error: error instanceof Error ? error.message : "Whop checkout could not be created",
    });
  }
});

router.post("/subscription/whop-verify", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  if (identity.isAdmin) {
    res.status(409).json({ error: "Master admin account is subscription exempt" });
    return;
  }
  const checkoutIdentifier = typeof req.body?.checkoutId === "string"
    ? req.body.checkoutId.trim()
    : "";
  if (!checkoutIdentifier) {
    res.status(400).json({ error: "A Whop checkout ID is required" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const enforced = await enforceSubscription(merchant, identity.isAdmin);
  const payment = (
    await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.merchantId, merchant.id),
          eq(paymentsTable.method, "whop"),
          or(
            eq(paymentsTable.evidenceReference, checkoutIdentifier),
            eq(paymentsTable.reference, checkoutIdentifier),
          ),
        ),
      )
      .limit(1)
  )[0];
  if (!payment) {
    res.status(404).json({ error: "Whop checkout is not associated with this account" });
    return;
  }
  if (payment.status === "confirmed") {
    res.json({
      status: "confirmed",
      paymentId: null,
      message: "Whop payment was already verified.",
      subscription: serializeSubscription(merchant, enforced.subscription),
    });
    return;
  }
  const checkoutId = payment.evidenceReference;
  if (!checkoutId) {
    res.status(409).json({
      error: "The Whop checkout is still being prepared. Retry in a moment.",
    });
    return;
  }
  try {
    await whopRequest<WhopCheckoutConfiguration>(
      `/api/v1/checkout_configurations/${encodeURIComponent(checkoutId)}`,
    );
    const paymentsPayload = await whopRequest<{ data?: WhopPayment[] }>(
      `/api/v1/payments?account_id=${encodeURIComponent(whopCompanyId())}&first=100`,
    );
    const candidates = Array.isArray(paymentsPayload.data) ? paymentsPayload.data : [];
    const paymentMatch = candidates.find((candidate) => {
      const metadata = candidate.metadata ?? {};
      const candidateCheckoutId =
        candidate.checkout_configuration_id ??
        candidate.checkout_id ??
        (typeof metadata.checkout_id === "string" ? metadata.checkout_id : null);
      const planId =
        candidate.membership?.plan?.id ??
        candidate.plan?.id ??
        null;
      const status = String(candidate.status ?? "").toLowerCase();
      const amount = Number(candidate.amount ?? NaN);
      const createdAt = candidate.created_at ? new Date(candidate.created_at).getTime() : NaN;
      return (
        (candidateCheckoutId === checkoutId ||
          (planId === whopPlanId() &&
            Number.isFinite(createdAt) &&
            createdAt >= payment.createdAt.getTime())) &&
        ["succeeded", "paid", "completed", "captured", "active"].includes(status) &&
        Number.isFinite(amount) &&
        Math.abs(amount - toNumber(payment.amount)) < 0.01
      );
    });
    const failedMatch = candidates.find((candidate) => {
      const metadata = candidate.metadata ?? {};
      const candidateCheckoutId =
        candidate.checkout_configuration_id ??
        candidate.checkout_id ??
        (typeof metadata.checkout_id === "string" ? metadata.checkout_id : null);
      return candidateCheckoutId === checkoutId &&
        ["failed", "declined", "canceled", "cancelled"].includes(
          String(candidate.status ?? "").toLowerCase(),
        );
    });
    if (failedMatch) {
      await db
        .update(paymentsTable)
        .set({
          status: "failed",
          reviewNote: "Whop reported that the payment failed",
          reviewedAt: new Date(),
        })
        .where(and(eq(paymentsTable.id, payment.id), eq(paymentsTable.status, "under_review")));
      res.json({
        status: "failed",
        paymentId: failedMatch.id ?? null,
        message: "Whop reported that this payment failed. No balance was credited.",
        subscription: serializeSubscription(merchant, enforced.subscription),
      });
      return;
    }
    if (!paymentMatch) {
      res.json({
        status: "pending",
        paymentId: null,
        message: "Whop has not reported a verified payment yet. You can retry verification shortly.",
        subscription: serializeSubscription(merchant, enforced.subscription),
      });
      return;
    }
    const result = await db.transaction(async (tx) => {
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
      const currentPayment = (
        await tx
          .select()
          .from(paymentsTable)
          .where(eq(paymentsTable.id, payment.id))
          .limit(1)
      )[0];
      if (!currentSubscription || !currentPayment) {
        throw new Error("The Whop payment record is no longer available");
      }
      if (currentPayment.status === "confirmed") {
        return currentSubscription;
      }
      const remaining = Math.max(
        0,
        toNumber(currentSubscription.amountDue) -
          toNumber(currentSubscription.amountPaid),
      );
      if (remaining === 0) return currentSubscription;
      if (Math.abs(remaining - toNumber(currentPayment.amount)) >= 0.01) {
        throw new Error("The verified Whop amount does not match the outstanding subscription");
      }
      const [updatedSubscription] = await tx
        .update(subscriptionsTable)
        .set({
          amountPaid: (toNumber(currentSubscription.amountPaid) + remaining).toFixed(2),
          paymentMethod: "whop",
          status: "active",
        })
        .where(
          and(
            eq(subscriptionsTable.id, currentSubscription.id),
            eq(subscriptionsTable.amountPaid, currentSubscription.amountPaid),
          ),
        )
        .returning();
      if (!updatedSubscription) throw new Error("Subscription changed while Whop payment was processing");
      await tx
        .update(paymentsTable)
        .set({
          status: "confirmed",
          reviewNote: "Verified from Whop payment records",
          reviewedBy: "whop",
          reviewedAt: new Date(),
        })
        .where(and(eq(paymentsTable.id, currentPayment.id), eq(paymentsTable.status, currentPayment.status)));
      if (merchant.status !== "banned") {
        await tx
          .update(merchantsTable)
          .set({ status: "active" })
          .where(eq(merchantsTable.id, merchant.id));
      }
      await tx.insert(activityTable).values({
        merchantId: merchant.id,
        type: "whop_payment_verified",
        title: "Whop subscription payment verified",
        description: "Whop payment evidence was verified server-side and applied to the subscription.",
        amount: remaining.toFixed(2),
        currency: currentSubscription.currency,
        tone: "positive",
      });
      return updatedSubscription;
    });
    res.json({
      status: "confirmed",
      paymentId: paymentMatch.id ?? null,
      message: "Whop payment verified and subscription settled.",
      subscription: serializeSubscription(merchant, result),
    });
  } catch (error) {
    req.log.warn({ err: error }, "Whop payment verification failed");
    res.status(502).json({
      error: error instanceof Error ? error.message : "Whop payment could not be verified",
    });
  }
});

router.get("/admin/overview", async (req, res): Promise<void> => {
  const identity = await requireAdmin(req, res);
  if (!identity) return;
  const adminMerchant = (
    await db
      .select()
      .from(merchantsTable)
      .where(eq(merchantsTable.clerkUserId, identity.clerkUserId))
      .limit(1)
  )[0];
  const platformCurrency = adminMerchant?.currency ?? "USD";
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
        eq(paymentsTable.currency, platformCurrency),
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
      adminMerchant
        ? and(
            eq(withdrawalsTable.merchantId, adminMerchant.id),
            eq(withdrawalsTable.currency, platformCurrency),
          )
        : sql`false`,
    );
  res.json(
    GetAdminOverviewResponse.parse({
      currency: platformCurrency,
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
            (daysSince(merchant.registeredAt, subscription?.billingTimezone ?? "UTC") >= 10 ||
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
        daysSinceRegistration: daysSince(enforced.merchant.registeredAt, enforced.subscription.billingTimezone ?? "UTC"),
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
      daysSinceRegistration: daysSince(merchant.registeredAt, subscription.billingTimezone ?? "UTC"),
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
       if (current.orderId === null) throw new Error("Invoice payments are verified from their invoice review");
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
           await tx.insert(inventoryMovementsTable).values({ merchantId: merchant.id, locationId: order.locationId, supplierProductId: reservation.supplierProductId, orderId: order.id, quantityDelta: -reservation.quantity, reason: "sale", referenceKey: `sale:${id}` }).onConflictDoNothing({ target: inventoryMovementsTable.referenceKey });
            await emitDomainEvent(tx, { merchantId: merchant.id, eventType: "inventory.committed", aggregateType: "inventory_reservation", aggregateId: reservation.id, actorType: "merchant", actorId: identity.clerkUserId, source: "merchant_api", idempotencyKey: `inventory-reservation:${reservation.id}:committed`, payload: { orderId: order.id, supplierProductId: reservation.supplierProductId, quantity: reservation.quantity } });
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
       await emitDomainEvent(tx, {
         merchantId: merchant.id, eventType: "payment.verified", aggregateType: "payment_intent",
         aggregateId: updated.id, actorType: "merchant", actorId: identity.clerkUserId,
         source: "merchant_api", idempotencyKey: `payment-intent:${updated.id}:verified`,
         payload: { orderId: current.orderId, amountMinor: current.amountMinor, currency: current.currency, method: current.method },
         before: { status: current.status }, after: { status: updated.status },
       });
      return updated;
    });
    res.json(VerifyPaymentResponse.parse(intent));
  } catch (error) { req.log.error({ err: error }, "payment verification failed"); res.status(409).json({ error: error instanceof Error ? error.message : "Payment verification failed" }); }
});

router.get("/balances", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return; const merchant = await getOrCreateMerchant(identity);
  const rows = await db.select({ currency: ledgerEntriesTable.currency, balance: sql<string>`coalesce(sum(${ledgerEntriesTable.amountMinor}),0)` }).from(ledgerEntriesTable).where(eq(ledgerEntriesTable.merchantId, merchant.id)).groupBy(ledgerEntriesTable.currency);
  const [subscription, withdrawalRows] = await Promise.all([
    db.select({ currency: subscriptionsTable.currency, earningsHeld: subscriptionsTable.earningsHeld }).from(subscriptionsTable).where(eq(subscriptionsTable.merchantId, merchant.id)).limit(1).then(([row]) => row),
    db.select({
      currency: withdrawalsTable.currency,
      total: sql<string>`coalesce(sum(${withdrawalsTable.amount}), 0)`,
    }).from(withdrawalsTable).where(and(
      eq(withdrawalsTable.merchantId, merchant.id),
      inArray(withdrawalsTable.status, ["pending", "approved", "paid"]),
    )).groupBy(withdrawalsTable.currency),
  ]);
  const withdrawalByCurrency = new Map(withdrawalRows.map((row) => [row.currency, toNumber(row.total)]));
  res.json(GetMerchantBalancesResponse.parse(rows.map((r) => {
    const ledgerBalanceMinor = Number(r.balance);
    const withdrawalHeldMinor = Math.round((withdrawalByCurrency.get(r.currency) ?? 0) * 100);
    const subscriptionHeldMinor = subscription?.currency === r.currency ? Math.round(toNumber(subscription.earningsHeld) * 100) : 0;
    return {
      currency: r.currency,
      ledgerBalanceMinor,
      availableBalanceMinor: Math.max(0, ledgerBalanceMinor - withdrawalHeldMinor - subscriptionHeldMinor),
      heldBalanceMinor: withdrawalHeldMinor + subscriptionHeldMinor,
    };
  })));
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
         const [movement] = await tx.insert(inventoryMovementsTable).values({ merchantId: merchant.id, locationId: order.locationId, supplierProductId: order.supplierProductId, orderId: order.id, quantityDelta: order.quantity, reason: "refund_restock", referenceKey: `restock:refund:${id}` }).onConflictDoNothing({ target: inventoryMovementsTable.referenceKey }).returning();
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
       await emitDomainEvent(tx, {
         merchantId: merchant.id, eventType: "refund.processed", aggregateType: "refund",
         aggregateId: updated.id, actorType: "merchant", actorId: identity.clerkUserId, source: "merchant_api",
         idempotencyKey: `refund:${updated.id}:processed`,
         payload: { orderId: current.orderId, amountMinor: current.amountMinor, currency: current.currency, inventoryRestock: current.inventoryRestock },
         before: { status: current.status }, after: { status: updated.status },
       });
      return updated;
    }); res.json(ApproveRefundResponse.parse(refund));
  } catch (error) { req.log.error({ err: error }, "refund approval failed"); res.status(409).json({ error: error instanceof Error ? error.message : "Refund failed" }); }
});

router.get("/inventory/reservations", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const access = await requireTenantPermission(identity, merchant.id, "inventory.read", res); if (!access) return;
  const rows = await db.select().from(inventoryReservationsTable)
    .where(and(eq(inventoryReservationsTable.merchantId, merchant.id), access.locationIds ? inArray(inventoryReservationsTable.locationId, [...access.locationIds]) : undefined))
    .orderBy(desc(inventoryReservationsTable.createdAt)).limit(500);
  res.json(ListInventoryReservationsResponse.parse(rows));
});

router.get("/inventory/movements", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const access = await requireTenantPermission(identity, merchant.id, "inventory.read", res); if (!access) return;
  const rows = await db.select().from(inventoryMovementsTable)
    .where(and(eq(inventoryMovementsTable.merchantId, merchant.id), access.locationIds ? inArray(inventoryMovementsTable.locationId, [...access.locationIds]) : undefined))
    .orderBy(desc(inventoryMovementsTable.createdAt)).limit(500);
  res.json(ListInventoryMovementsResponse.parse(rows));
});

router.post("/inventory/adjustments", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res); if (!identity) return;
  const body = CreateInventoryAdjustmentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid inventory adjustment" }); return; }
  const merchant = await getOrCreateMerchant(identity);
  const access = await requireTenantPermission(identity, merchant.id, "inventory.adjust", res); if (!access) return;
  if (access.locationIds !== null) {
    res.status(403).json({ error: "Inventory is merchant-global; location-scoped staff cannot make global inventory adjustments" });
    return;
  }
  const location = await resolveOrderLocation(merchant.id, access);
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
      const [created] = await tx.insert(inventoryMovementsTable).values({ merchantId: merchant.id, locationId: location.id, supplierProductId: product.id, quantityDelta: body.data.quantityDelta, reason: body.data.reason.trim(), referenceKey: body.data.referenceKey.trim() }).returning();
      if (!created) throw new Error("Adjustment could not be recorded");
      await tx.update(supplierProductsTable).set({ availabilityQuantity: product.availabilityQuantity + body.data.quantityDelta }).where(and(eq(supplierProductsTable.id, product.id), eq(supplierProductsTable.merchantId, merchant.id)));
       await emitDomainEvent(tx, { merchantId: merchant.id, eventType: "inventory.adjusted", aggregateType: "inventory_movement", aggregateId: created.id, actorType: "merchant", actorId: identity.clerkUserId, source: "merchant_api", idempotencyKey: `inventory-adjustment:${created.id}`, payload: { supplierProductId: product.id, quantityDelta: created.quantityDelta, reason: created.reason, referenceKey: created.referenceKey } });
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