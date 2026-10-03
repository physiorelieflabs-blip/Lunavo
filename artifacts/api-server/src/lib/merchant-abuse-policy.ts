export const MAX_DAILY_AUTOMATION_ACTIONS = 10_000;
export const MAX_STORE_AUCTION_BID_VELOCITY = 12;
export const BID_VELOCITY_WINDOW_MS = 5 * 60_000;

export type AbuseSignal =
  | "self_purchase"
  | "self_bid"
  | "referral_collision"
  | "duplicate_payment"
  | "unverified_payment"
  | "inventory_mismatch"
  | "tenant_scope_violation"
  | "automation_limit"
  | "connector_not_authorized"
  | "auction_manipulation"
  | "ownership_conflict"
  | "price_without_source_data";

/**
 * Central business-abuse rules. Route handlers must enforce these server-side;
 * client supplied flags, profit figures, payment states and ownership claims
 * are never authoritative.
 */
export function hasSelfPurchaseConflict(input: {
  merchantId: number;
  sellerMerchantId: number | null;
  buyerMerchantId: number | null;
  buyerEmail?: string | null;
  sellerEmail?: string | null;
}): boolean {
  if (input.sellerMerchantId !== null && input.buyerMerchantId !== null && input.sellerMerchantId === input.buyerMerchantId) return true;
  const buyer = input.buyerEmail?.trim().toLowerCase();
  const seller = input.sellerEmail?.trim().toLowerCase();
  return Boolean(buyer && seller && buyer === seller);
}

export function referralAccountsConflict(input: {
  referrerMerchantId: number;
  referredMerchantId: number;
  referrerEmail?: string | null;
  referredEmail?: string | null;
}): boolean {
  if (input.referrerMerchantId === input.referredMerchantId) return true;
  const a = input.referrerEmail?.trim().toLowerCase();
  const b = input.referredEmail?.trim().toLowerCase();
  return Boolean(a && b && a === b);
}

export function isSafeAutomationCount(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_DAILY_AUTOMATION_ACTIONS;
}

export function paymentCanCreateRevenue(status: string, verifiedByProvider: boolean): boolean {
  return verifiedByProvider && ["provider_confirmed", "successful"].includes(status);
}

export function paymentCanBeRetried(status: string): boolean {
  return ["created", "awaiting_payment", "pending", "processing", "failed", "expired", "cancelled", "reconciliation_required"].includes(status);
}

export function inventoryCanDecrement(input: { paymentVerified: boolean; orderState: string; quantity: number; availableQuantity: number }): boolean {
  return input.paymentVerified && ["paid", "fulfilled"].includes(input.orderState) && Number.isInteger(input.quantity) && input.quantity > 0 && input.availableQuantity >= input.quantity;
}

export function connectorMayPublish(input: { connected: boolean; authorized: boolean; revoked: boolean }): boolean {
  return input.connected && input.authorized && !input.revoked;
}

export function canTransferStoreOwnership(input: {
  storeId: number;
  currentOwnerId: number;
  buyerMerchantId: number;
  auctionClosed: boolean;
  paymentVerified: boolean;
}): boolean {
  return input.storeId > 0 && input.currentOwnerId > 0 && input.buyerMerchantId > 0 && input.currentOwnerId !== input.buyerMerchantId && input.auctionClosed && input.paymentVerified;
}

export function auctionBidIsValid(input: {
  auctionActive: boolean;
  startsAt: Date;
  endsAt: Date;
  amount: number;
  currentBid: number;
  increment: number;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  return input.auctionActive && now >= input.startsAt && now < input.endsAt && Number.isFinite(input.amount) && input.amount >= input.currentBid + input.increment;
}

export function shouldFlagAuctionVelocity(countInWindow: number): boolean {
  return Number.isFinite(countInWindow) && countInWindow >= MAX_STORE_AUCTION_BID_VELOCITY;
}
