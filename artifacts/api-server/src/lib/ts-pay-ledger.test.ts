import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTsPayLedgerPostings,
  tsPayAmountMinor,
  tsPayAvailableMinor,
  tsPayReferenceKey,
  validateTsPayReplay,
  validateTsPayTransfer,
} from "./ts-pay-ledger";

test("retries use the same merchant-scoped transfer idempotency key", () => {
  assert.equal(tsPayReferenceKey(12, " payout-42 "), tsPayReferenceKey(12, "payout-42"));
  assert.notEqual(tsPayReferenceKey(12, "payout-42"), tsPayReferenceKey(13, "payout-42"));
});

test("money is converted to safe positive minor units", () => {
  assert.equal(tsPayAmountMinor(19.99), 1999);
  assert.throws(() => tsPayAmountMinor(0), /positive/);
  assert.throws(() => tsPayAmountMinor(Number.MAX_VALUE), /positive/);
});

test("available balance excludes withdrawal and earnings holds", () => {
  assert.equal(tsPayAvailableMinor({
    ledgerBalanceMinor: 10000,
    withdrawalHoldMinor: 2500,
    earningsHeldMinor: 1000,
  }), 6500);
});

test("currency mismatch and insufficient funds are rejected before posting", () => {
  assert.throws(() => validateTsPayTransfer({
    fromCurrency: "USD",
    toCurrency: "NGN",
    requestedCurrency: "USD",
    amountMinor: 100,
    availableMinor: 1000,
  }), /same currency/);
  assert.throws(() => validateTsPayTransfer({
    fromCurrency: "USD",
    toCurrency: "USD",
    requestedCurrency: "USD",
    amountMinor: 1001,
    availableMinor: 1000,
  }), /available to transfer/);
});

test("every transfer produces one balanced debit and credit pair", () => {
  const postings = buildTsPayLedgerPostings({
    fromMerchantId: 12,
    toMerchantId: 13,
    amountMinor: 4500,
    currency: "USD",
    referenceKey: tsPayReferenceKey(12, "transfer-1"),
  });
  assert.equal(postings[0].amountMinor + postings[1].amountMinor, 0);
  assert.deepEqual(postings.map((posting) => posting.entryType), [
    "internal_transfer_out",
    "internal_transfer_in",
  ]);
  assert.equal(new Set(postings.map((posting) => posting.referenceKey)).size, 2);
});

test("the same idempotency key cannot create a second ledger pair", () => {
  const reference = tsPayReferenceKey(12, "transfer-1");
  const first = buildTsPayLedgerPostings({
    fromMerchantId: 12, toMerchantId: 13, amountMinor: 4500, currency: "USD", referenceKey: reference,
  });
  const retry = buildTsPayLedgerPostings({
    fromMerchantId: 12, toMerchantId: 13, amountMinor: 4500, currency: "USD", referenceKey: reference,
  });
  assert.deepEqual(retry, first);
});

test("an idempotency replay must match the original transfer request", () => {
  const original = {
    existingToMerchantId: 13,
    existingAmountMinor: 4500,
    existingCurrency: "USD",
    existingNote: "Operating float",
    requestedToMerchantId: 13,
    requestedAmountMinor: 4500,
    requestedCurrency: "USD",
    requestedNote: "Operating float",
  };
  assert.doesNotThrow(() => validateTsPayReplay(original));
  assert.throws(
    () => validateTsPayReplay({ ...original, requestedAmountMinor: 4600 }),
    /different transfer/,
  );
  assert.throws(
    () => validateTsPayReplay({ ...original, requestedToMerchantId: 14 }),
    /different transfer/,
  );
  assert.throws(
    () => validateTsPayReplay({ ...original, requestedNote: null }),
    /different transfer/,
  );
});