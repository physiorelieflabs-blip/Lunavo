import assert from "node:assert/strict";
import {
  calculateDashboardWindow,
  calculateMerchantNetMinor,
  calculateSubscriptionWithReferral,
  calculateTsCommerceFeeMinor,
  providerPaymentMatches,
} from "../artifacts/api-server/src/lib/critical-payment-rules.ts";

function expectReject(label: string, actual: boolean) {
  assert.equal(actual, false, `${label} must fail closed`);
}

// Money arithmetic and platform fee rules.
assert.equal(calculateTsCommerceFeeMinor(3000), 30);
assert.equal(calculateMerchantNetMinor(10000, 250), 9650);
assert.equal(calculateMerchantNetMinor(10000, null), null);

// Subscription referral discount cannot exceed the gross subscription price.
assert.deepEqual(calculateSubscriptionWithReferral(3000, 900), {
  grossAmountMinor: 3000,
  referralDiscountMinor: 900,
  payableAmountMinor: 2100,
});
assert.deepEqual(calculateSubscriptionWithReferral(3000, 5000), {
  grossAmountMinor: 3000,
  referralDiscountMinor: 3000,
  payableAmountMinor: 0,
});

// Verified provider payments must match amount, currency, reference, merchant and order.
const expectedPayment = {
  expectedAmountMinor: 3000,
  observedAmountMinor: 3000,
  expectedCurrency: "USD",
  observedCurrency: "usd",
  expectedReference: "ts-sub-abc",
  observedReference: "ts-sub-abc",
  expectedMerchantId: 42,
  observedMerchantId: 42,
  expectedOrderId: 77,
  observedOrderId: 77,
};
assert.equal(providerPaymentMatches(expectedPayment), true);
expectReject("wrong amount", providerPaymentMatches({ ...expectedPayment, observedAmountMinor: 2999 }));
expectReject("wrong currency", providerPaymentMatches({ ...expectedPayment, observedCurrency: "EUR" }));
expectReject("wrong reference", providerPaymentMatches({ ...expectedPayment, observedReference: "other" }));
expectReject("wrong merchant", providerPaymentMatches({ ...expectedPayment, observedMerchantId: 43 }));
expectReject("wrong order", providerPaymentMatches({ ...expectedPayment, observedOrderId: 78 }));

// Access windows expire at the configured deadline and cannot be prolonged by client time.
const start = new Date("2026-01-01T00:00:00.000Z");
const beforeExpiry = calculateDashboardWindow(start, new Date("2026-01-15T23:59:59.000Z"));
const atExpiry = calculateDashboardWindow(start, new Date("2026-01-16T00:00:00.000Z"));
assert.equal(beforeExpiry.locked, false);
assert.equal(atExpiry.locked, true);

console.log("TS Commerce security simulation: PASS");
