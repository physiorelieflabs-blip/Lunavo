import assert from "node:assert/strict";
import test from "node:test";
import { buildTsPayLedgerPostings, buildTsPayWithdrawalLedgerEntry, tsPayAmountMinor, tsPayAvailableMinor, tsPayReferenceKey, validateTsPayReplay, validateTsPayTransfer } from "./ts-pay-ledger";

test("retries use the same merchant-scoped transfer idempotency key", () => {
  assert.equal(tsPayReferenceKey(12, " payout-42 "), tsPayReferenceKey(12, "payout-42"));
  assert.notEqual(tsPayReferenceKey(12, "payout-42"), tsPayReferenceKey(13, "payout-42"));
  assert.throws(() => tsPayReferenceKey(0, "x"), /Invalid merchant/);
});

test("money is converted to safe positive minor units", () => {
  assert.equal(tsPayAmountMinor(19.99), 1999);
  assert.throws(() => tsPayAmountMinor(0), /positive/);
  assert.throws(() => tsPayAmountMinor(Number.MAX_VALUE), /positive/);
});

test("available balance excludes withdrawal and earnings holds and cannot be negative", () => {
  assert.equal(tsPayAvailableMinor({ ledgerBalanceMinor: 10000, withdrawalHoldMinor: 2500, earningsHeldMinor: 1000 }), 6500);
  assert.equal(tsPayAvailableMinor({ ledgerBalanceMinor: 1000, withdrawalHoldMinor: 800, earningsHeldMinor: 500 }), 0);
});

test("currency mismatch, self-transfer and insufficient funds are rejected before posting", () => {
  assert.throws(() => validateTsPayTransfer({ fromMerchantId: 12, toMerchantId: 13, fromCurrency: "USD", toCurrency: "NGN", requestedCurrency: "USD", amountMinor: 100, availableMinor: 1000 }), /same currency/);
  assert.throws(() => validateTsPayTransfer({ fromMerchantId: 12, toMerchantId: 12, fromCurrency: "USD", toCurrency: "USD", requestedCurrency: "USD", amountMinor: 100, availableMinor: 1000 }), /different merchant/);
  assert.throws(() => validateTsPayTransfer({ fromMerchantId: 12, toMerchantId: 13, fromCurrency: "USD", toCurrency: "USD", requestedCurrency: "USD", amountMinor: 1001, availableMinor: 1000 }), /available to transfer/);
});

test("every transfer produces one balanced debit and credit pair", () => {
  const postings = buildTsPayLedgerPostings({ fromMerchantId: 12, toMerchantId: 13, amountMinor: 4500, currency: "usd", referenceKey: tsPayReferenceKey(12, "transfer-1") });
  assert.equal(postings[0].amountMinor + postings[1].amountMinor, 0);
  assert.deepEqual(postings.map((posting) => posting.entryType), ["internal_transfer_out", "internal_transfer_in"]);
  assert.deepEqual(postings.map((posting) => posting.currency), ["USD", "USD"]);
  assert.equal(new Set(postings.map((posting) => posting.referenceKey)).size, 2);
});

test("invalid ledger postings are rejected rather than creating an unbalanced transfer", () => {
  assert.throws(() => buildTsPayLedgerPostings({ fromMerchantId: 12, toMerchantId: 12, amountMinor: 100, currency: "USD", referenceKey: "x" }), /different valid merchant/);
  assert.throws(() => buildTsPayLedgerPostings({ fromMerchantId: 12, toMerchantId: 13, amountMinor: 0, currency: "USD", referenceKey: "x" }), /positive minor units/);
  assert.throws(() => buildTsPayLedgerPostings({ fromMerchantId: 12, toMerchantId: 13, amountMinor: 100, currency: "US", referenceKey: "x" }), /3-letter/);
  assert.throws(() => buildTsPayLedgerPostings({ fromMerchantId: 12, toMerchantId: 13, amountMinor: 100, currency: "USD", referenceKey: " " }), /reference key/);
});

test("the same idempotency key produces the same deterministic ledger references", () => {
  const reference = tsPayReferenceKey(12, "transfer-1");
  const first = buildTsPayLedgerPostings({ fromMerchantId: 12, toMerchantId: 13, amountMinor: 4500, currency: "USD", referenceKey: reference });
  const retry = buildTsPayLedgerPostings({ fromMerchantId: 12, toMerchantId: 13, amountMinor: 4500, currency: "USD", referenceKey: reference });
  assert.deepEqual(retry, first);
});

test("an idempotency replay must match the original transfer request", () => {
  const original = { existingToMerchantId: 13, existingAmountMinor: 4500, existingCurrency: "USD", existingNote: "Operating float", requestedToMerchantId: 13, requestedAmountMinor: 4500, requestedCurrency: "USD", requestedNote: "Operating float" };
  assert.doesNotThrow(() => validateTsPayReplay(original));
  assert.throws(() => validateTsPayReplay({ ...original, requestedAmountMinor: 4600 }), /different transfer/);
  assert.throws(() => validateTsPayReplay({ ...original, requestedToMerchantId: 14 }), /different transfer/);
  assert.throws(() => validateTsPayReplay({ ...original, requestedNote: null }), /different transfer/);
});

test("withdrawal lifecycle entries reserve once, release on rejection, and settle without a second debit", () => {
  const reserve = buildTsPayWithdrawalLedgerEntry({ merchantId: 12, withdrawalId: 44, amountMinor: 12500, currency: "usd", event: "reserve" });
  const release = buildTsPayWithdrawalLedgerEntry({ merchantId: 12, withdrawalId: 44, amountMinor: 12500, currency: "USD", event: "release" });
  const paid = buildTsPayWithdrawalLedgerEntry({ merchantId: 12, withdrawalId: 44, amountMinor: 12500, currency: "USD", event: "paid" });
  assert.equal(reserve.amountMinor + release.amountMinor, 0);
  assert.equal(paid.amountMinor, 0);
  assert.equal(reserve.currency, "USD");
  assert.deepEqual([reserve.entryType, release.entryType, paid.entryType], ["withdrawal_reserve", "withdrawal_release", "withdrawal_paid"]);
});
