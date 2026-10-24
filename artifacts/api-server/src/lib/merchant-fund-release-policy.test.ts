import assert from "node:assert/strict";
import { it as test } from "vitest";
import { merchantFundReleaseVerificationFailure } from "./merchant-fund-release-policy";

const valid = {
  providerPaid: true,
  reversalOrDispute: false,
  observedTransactionId: "tx-123",
  expectedTransactionId: "tx-123",
  observedAmountMinor: 10000,
  expectedAmountMinor: 10000,
  observedCurrency: "USD",
  expectedCurrency: "USD",
  observedReference: "LUNAVO-ORDER-42",
  expectedReference: "LUNAVO-ORDER-42",
  observedProviderFeeMinor: 100,
  expectedProviderFeeMinor: 100,
  expectedLunavoFeeMinor: 100,
  expectedMerchantNetMinor: 9800,
};

test("accepts exact successful provider evidence and reconciled fee split", () => {
  assert.equal(merchantFundReleaseVerificationFailure(valid), null);
});

test("rejects unsuccessful, refunded, reversed, disputed, or mismatched payments", () => {
  const cases = [
    { ...valid, providerPaid: false },
    { ...valid, reversalOrDispute: true },
    { ...valid, observedTransactionId: "other-id" },
    { ...valid, observedAmountMinor: 9999 },
    { ...valid, observedCurrency: "NGN" },
    { ...valid, observedReference: "OTHER-ORDER" },
    { ...valid, observedProviderFeeMinor: 99 },
    { ...valid, expectedMerchantNetMinor: 9799 },
    { ...valid, expectedLunavoFeeMinor: 99 },
  ];
  for (const input of cases) {
    assert.notEqual(merchantFundReleaseVerificationFailure(input), null);
  }
});

test("does not release without a real observed transaction id or a safe amount", () => {
  assert.notEqual(merchantFundReleaseVerificationFailure({ ...valid, observedTransactionId: null }), null);
  assert.notEqual(merchantFundReleaseVerificationFailure({ ...valid, expectedAmountMinor: Number.MAX_SAFE_INTEGER + 1 }), null);
});

test("validates provider charge currency independently from merchant settlement currency", () => {
  const fxPayment = {
    ...valid,
    observedAmountMinor: 10000,
    expectedAmountMinor: 10000,
    observedCurrency: "USD",
    expectedCurrency: "USD",
    observedProviderFeeMinor: 100,
    expectedProviderFeeMinor: 150,
    expectedProviderFeeEvidenceMinor: 100,
    expectedMerchantGrossMinor: 15000,
    expectedMerchantCurrency: "NGN",
    expectedLunavoFeeMinor: 150,
    expectedMerchantNetMinor: 14700,
  };
  assert.equal(merchantFundReleaseVerificationFailure(fxPayment), null);
  assert.notEqual(merchantFundReleaseVerificationFailure({ ...fxPayment, observedCurrency: "NGN" }), null);
  assert.notEqual(merchantFundReleaseVerificationFailure({ ...fxPayment, expectedMerchantNetMinor: 14699 }), null);
});
