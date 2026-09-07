export const TS_COMMERCE_TRANSACTION_FEE_RATE = 0.01;
export const REFERRAL_DISCOUNT_MINOR = 900;
export const REFERRAL_SUBSCRIPTION_GROSS_MINOR = 3000;

export const PAYMENT_STATUSES = [
  "created",
  "awaiting_payment",
  "pending",
  "processing",
  "provider_confirmed",
  "successful",
  "failed",
  "expired",
  "cancelled",
  "refunded",
  "partially_refunded",
  "disputed",
  "charged_back",
  "reversed",
  "reconciliation_required",
] as const;

export function calculateTsCommerceFeeMinor(grossAmountMinor: number): number {
  const gross = Math.max(0, Math.round(grossAmountMinor));
  return Math.round(gross * TS_COMMERCE_TRANSACTION_FEE_RATE);
}

export function calculateMerchantNetMinor(
  grossAmountMinor: number,
  providerFeeMinor: number | null,
): number | null {
  if (providerFeeMinor === null) return null;
  return Math.max(
    0,
    Math.round(grossAmountMinor) - Math.max(0, Math.round(providerFeeMinor)) - calculateTsCommerceFeeMinor(grossAmountMinor),
  );
}

export function applyEarningsToSubscription(input: {
  earningsHeldMinor: number;
  outstandingMinor: number;
}) {
  const held = Math.max(0, Math.round(input.earningsHeldMinor));
  const outstanding = Math.max(0, Math.round(input.outstandingMinor));
  const appliedMinor = Math.min(held, outstanding);
  return {
    appliedMinor,
    remainingOutstandingMinor: outstanding - appliedMinor,
    remainingHeldMinor: held - appliedMinor,
    settled: outstanding - appliedMinor === 0,
  };
}

export function calculateSubscriptionWithReferral(
  grossAmountMinor: number,
  discountAmountMinor: number,
) {
  const gross = Math.max(0, Math.round(grossAmountMinor));
  const discount = Math.min(gross, Math.max(0, Math.round(discountAmountMinor)));
  return {
    grossAmountMinor: gross,
    referralDiscountMinor: discount,
    payableAmountMinor: gross - discount,
  };
}

export function providerPaymentMatches(input: {
  expectedAmountMinor: number;
  observedAmountMinor: number;
  expectedCurrency: string;
  observedCurrency: string;
  expectedReference: string;
  observedReference: string;
  expectedMerchantId: number;
  observedMerchantId: number | null;
  expectedOrderId: number;
  observedOrderId: number | null;
}) {
  return (
    input.expectedAmountMinor === input.observedAmountMinor &&
    input.expectedCurrency.toUpperCase() === input.observedCurrency.toUpperCase() &&
    input.expectedReference === input.observedReference &&
    input.observedMerchantId === input.expectedMerchantId &&
    input.observedOrderId === input.expectedOrderId
  );
}

export function referralRewardIsRestricted(status: string): boolean {
  return ["earned", "applied", "recovery_required", "reversed"].includes(status);
}
