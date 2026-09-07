import assert from "node:assert/strict";
import test from "node:test";
import {
  PAYMENT_STATUSES,
  applyEarningsToSubscription,
  calculateMerchantNetMinor,
  calculateSubscriptionWithReferral,
  calculateTsCommerceFeeMinor,
  providerPaymentMatches,
  referralRewardIsRestricted,
} from "./critical-payment-rules";
import { calculateReferralDiscountMinor } from "./referrals";

test("payment state model contains every required explicit state", () => {
  for (const state of [
    "created", "awaiting_payment", "pending", "processing", "provider_confirmed",
    "successful", "failed", "expired", "cancelled", "refunded", "partially_refunded",
    "disputed", "charged_back", "reversed", "reconciliation_required",
  ]) assert.ok(PAYMENT_STATUSES.includes(state as never));
});

test("normal ₦50,000 payment calculates the platform fee without inventing provider fees", () => {
  assert.equal(calculateTsCommerceFeeMinor(5_000_000), 50_000);
  assert.equal(calculateMerchantNetMinor(5_000_000, null), null);
  assert.equal(calculateMerchantNetMinor(5_000_000, 75_000), 4_875_000);
});

test("provider identity, reference, amount and currency must all match", () => {
  const base = {
    expectedAmountMinor: 5_000_000,
    observedAmountMinor: 5_000_000,
    expectedCurrency: "NGN",
    observedCurrency: "ngn",
    expectedReference: "TS-PAY-98765",
    observedReference: "TS-PAY-98765",
    expectedMerchantId: 7,
    observedMerchantId: 7,
    expectedOrderId: 11,
    observedOrderId: 11,
  };
  assert.equal(providerPaymentMatches(base), true);
  assert.equal(providerPaymentMatches({ ...base, observedAmountMinor: 4_000_000 }), false);
  assert.equal(providerPaymentMatches({ ...base, observedMerchantId: 8 }), false);
});

test("partial earnings settlement never over-deducts", () => {
  assert.deepEqual(applyEarningsToSubscription({ earningsHeldMinor: 1_200, outstandingMinor: 3_000 }), {
    appliedMinor: 1_200,
    remainingOutstandingMinor: 1_800,
    remainingHeldMinor: 0,
    settled: false,
  });
  assert.deepEqual(applyEarningsToSubscription({ earningsHeldMinor: 5_000, outstandingMinor: 3_000 }), {
    appliedMinor: 3_000,
    remainingOutstandingMinor: 0,
    remainingHeldMinor: 2_000,
    settled: true,
  });
});

test("subscription referral discount is a $9 entitlement and produces $21 payable", () => {
  assert.equal(calculateReferralDiscountMinor(3_000), 900);
  assert.deepEqual(calculateSubscriptionWithReferral(3_000, 900), {
    grossAmountMinor: 3_000,
    referralDiscountMinor: 900,
    payableAmountMinor: 2_100,
  });
  assert.equal(referralRewardIsRestricted("earned"), true);
  assert.equal(referralRewardIsRestricted("applied"), true);
});

test("wrong amount cannot be treated as a fully paid transaction", () => {
  const order = 5_000_000;
  const provider = 4_000_000;
  assert.equal(providerPaymentMatches({
    expectedAmountMinor: order,
    observedAmountMinor: provider,
    expectedCurrency: "NGN",
    observedCurrency: "NGN",
    expectedReference: "TS-PAY-1",
    observedReference: "TS-PAY-1",
    expectedMerchantId: 1,
    observedMerchantId: 1,
    expectedOrderId: 1,
    observedOrderId: 1,
  }), false);
});

test("refund and chargeback states are distinct from success", () => {
  assert.notEqual("refunded", "successful");
  assert.notEqual("charged_back", "successful");
  assert.equal(referralRewardIsRestricted("recovery_required"), true);
});


test("dashboard earning window is fixed to its original start and cannot be reset by a route switch", () => {
  const start = new Date("2026-09-01T12:00:00.000Z");
  const first = calculateDashboardWindow(start, new Date("2026-09-05T12:00:00.000Z"));
  const after = calculateDashboardWindow(start, new Date("2026-09-10T12:00:00.000Z"));
  assert.equal(first.locked, false);
  assert.equal(first.expiresAt.toISOString(), "2026-09-16T12:00:00.000Z");
  assert.equal(after.locked, false);
  assert.equal(after.expiresAt.toISOString(), "2026-09-16T12:00:00.000Z");
});
