import assert from "node:assert/strict";
import { it as test } from "vitest";
import {
  buildTsPayLedgerPostings, buildTsPayWithdrawalLedgerEntry, tsPayAmountMinor,
  tsPayAvailableMinor, tsPayReferenceKey, validateTsPayReplay, validateTsPayTransfer,
} from "./ts-pay-ledger-rules";

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

test("available balance excludes withdrawal and earnings holds", () => {
  assert.equal(tsPayAvailableMinor({ ledgerBalanceMinor: 10000, withdrawalHoldMinor: 2500, earningsHeldMinor: 1000 }), 6500);
  assert.equal(tsPayAvailableMinor({ ledgerBalanceMinor: 1000, withdrawalHoldMinor: 800, earningsHeldMinor: 500 }), 0);
});

test("currency mismatch, self-transfer and insufficient funds are rejected", () => {
  assert.throws(() => validateTsPayTransfer({ fromMerchantId: 12, toMerchantId: 13, fromCurrency: "USD", toCurrency: "NGN", requestedCurrency: "USD", amountMinor: 100, availableMinor: 1000 }), /same currency/);
  assert.throws(() => validateTsPayTransfer({ fromMerchantId: 12, toMerchantId: 12, fromCurrency: "USD", toCurrency: "USD", requestedCurrency: "USD", amountMinor: 100, availableMinor: 1000 }), /two different valid merchant accounts/);
  assert.throws(() => validateTsPayTransfer({ fromMerchantId: 12, toMerchantId: 13, fromCurrency: "USD", toCurrency: "USD", requestedCurrency: "USD", amountMinor: 1001, availableMinor: 1000 }), /available to transfer/);
});

test("every transfer produces one balanced debit and credit pair", () => {
  const postings = buildTsPayLedgerPostings({ fromMerchantId: 12, toMerchantId: 13, amountMinor: 4500, currency: "usd", referenceKey: tsPayReferenceKey(12, "transfer-1") });
  assert.equal(postings[0].amountMinor + postings[1].amountMinor, 0);
  assert.deepEqual(postings.map((posting) => posting.entryType), ["internal_transfer_out", "internal_transfer_in"]);
});

test("invalid ledger postings are rejected", () => {
  assert.throws(() => buildTsPayLedgerPostings({ fromMerchantId: 12, toMerchantId: 12, amountMinor: 100, currency: "USD", referenceKey: "x" }), /different valid merchant/);
  assert.throws(() => buildTsPayLedgerPostings({ fromMerchantId: 12, toMerchantId: 13, amountMinor: 0, currency: "USD", referenceKey: "x" }), /positive minor units/);
  assert.throws(() => buildTsPayLedgerPostings({ fromMerchantId: 12, toMerchantId: 13, amountMinor: 100, currency: "US", referenceKey: "x" }), /3-letter/);
  assert.throws(() => buildTsPayLedgerPostings({ fromMerchantId: 12, toMerchantId: 13, amountMinor: 100, currency: "USD", referenceKey: " " }), /reference key/);
});

test("withdrawal reservations, releases, and payouts have correct ledger signs", () => {
  const base = { merchantId: 12, withdrawalId: 34, amountMinor: 2500, currency: "USD" };
  const reserve = buildTsPayWithdrawalLedgerEntry({ ...base, event: "reserve" });
  const release = buildTsPayWithdrawalLedgerEntry({ ...base, event: "release" });
  const paid = buildTsPayWithdrawalLedgerEntry({ ...base, event: "paid" });

  assert.equal(reserve.amountMinor, 2500, "reserve is a positive hold marker");
  assert.equal(reserve.entryType, "withdrawal_reserve");
  assert.equal(release.amountMinor, -2500, "release clears the outstanding hold");
  assert.equal(release.entryType, "withdrawal_release");
  assert.equal(paid.amountMinor, -2500, "confirmed payout reduces merchant funds");
  assert.equal(paid.entryType, "withdrawal_paid");
  assert.notEqual(reserve.referenceKey, paid.referenceKey);
});

test("the available balance cannot reuse funds already reserved for withdrawal", () => {
  const settledLedgerBalanceMinor = 10000; // Reserve/release markers are excluded.
  assert.equal(tsPayAvailableMinor({
    ledgerBalanceMinor: settledLedgerBalanceMinor,
    withdrawalHoldMinor: 8000,
    earningsHeldMinor: 0,
  }), 2000);
  assert.equal(tsPayAvailableMinor({
    ledgerBalanceMinor: settledLedgerBalanceMinor,
    withdrawalHoldMinor: 10000,
    earningsHeldMinor: 0,
  }), 0);
  // After a successful payout, the payout is a negative ledger debit and the
  // reservation no longer exists in the active-hold calculation.
  assert.equal(tsPayAvailableMinor({
    ledgerBalanceMinor: 7500,
    withdrawalHoldMinor: 0,
    earningsHeldMinor: 0,
  }), 7500);
});

test("the same idempotency key produces deterministic ledger references", () => {
  const reference = tsPayReferenceKey(12, "transfer-1");
  assert.deepEqual(
    buildTsPayLedgerPostings({ fromMerchantId: 12, toMerchantId: 13, amountMinor: 4500, currency: "USD", referenceKey: reference }),
    buildTsPayLedgerPostings({ fromMerchantId: 12, toMerchantId: 13, amountMinor: 4500, currency: "USD", referenceKey: reference }),
  );
});
