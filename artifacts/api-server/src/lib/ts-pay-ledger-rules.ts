import { createHash } from "node:crypto";

export type TsPayLedgerPosting = {
  merchantId: number;
  amountMinor: number;
  currency: string;
  entryType: "internal_transfer_out" | "internal_transfer_in";
  referenceKey: string;
};

function validMerchantId(value: number): boolean { return Number.isSafeInteger(value) && value > 0; }
function normalizedCurrency(value: string): string { return value.trim().toUpperCase(); }

export function tsPayAmountMinor(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be positive");
  const minor = Math.round(amount * 100);
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new Error("Amount must be positive and within safe payment limits");
  return minor;
}

export function tsPayAvailableMinor(input: {
  ledgerBalanceMinor: number;
  withdrawalHoldMinor: number;
  earningsHeldMinor: number;
}): number {
  for (const value of [input.ledgerBalanceMinor, input.withdrawalHoldMinor, input.earningsHeldMinor]) {
    if (!Number.isSafeInteger(value)) throw new Error("Ledger amounts must be safe integers");
  }
  return Math.max(
    0,
    input.ledgerBalanceMinor -
      Math.max(0, input.withdrawalHoldMinor) -
      Math.max(0, input.earningsHeldMinor),
  );
}

export function tsPayReferenceKey(merchantId: number, idempotencyKey: string): string {
  if (!validMerchantId(merchantId)) throw new Error("Invalid merchant");
  const normalized = idempotencyKey.trim();
  if (!normalized) throw new Error("A non-empty idempotency key is required");
  return createHash("sha256").update(`ts-pay:${merchantId}:${normalized}`, "utf8").digest("hex");
}

export function validateTsPayTransfer(input: {
  fromMerchantId: number;
  toMerchantId: number;
  fromCurrency: string;
  toCurrency: string;
  requestedCurrency: string;
  amountMinor: number;
  availableMinor: number;
}): void {
  if (
    !validMerchantId(input.fromMerchantId) ||
    !validMerchantId(input.toMerchantId) ||
    input.fromMerchantId === input.toMerchantId
  ) {
    throw new Error("TS Pay transfers require two different valid merchant accounts");
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Transfer amount must be positive minor units");
  }
  if (!Number.isSafeInteger(input.availableMinor) || input.availableMinor < 0) {
    throw new Error("Available balance is invalid");
  }
  if (input.amountMinor > input.availableMinor) {
    throw new Error("Requested amount exceeds available to transfer balance");
  }

  const fromCurrency = normalizedCurrency(input.fromCurrency);
  const toCurrency = normalizedCurrency(input.toCurrency);
  const requested = normalizedCurrency(input.requestedCurrency);
  if (!/^[A-Z]{3}$/.test(fromCurrency) || !/^[A-Z]{3}$/.test(toCurrency) || !/^[A-Z]{3}$/.test(requested)) {
    throw new Error("TS Pay transfer currencies must be 3-letter ISO codes");
  }
  if (fromCurrency !== toCurrency || requested !== fromCurrency) {
    throw new Error("TS Pay transfers require the same currency");
  }
}

export function buildTsPayLedgerPostings(input: {
  fromMerchantId: number;
  toMerchantId: number;
  amountMinor: number;
  currency: string;
  referenceKey: string;
}): [TsPayLedgerPosting, TsPayLedgerPosting] {
  if (
    !validMerchantId(input.fromMerchantId) ||
    !validMerchantId(input.toMerchantId) ||
    input.fromMerchantId === input.toMerchantId
  ) {
    throw new Error("Transfer requires two different valid merchant accounts");
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Transfer amount must be positive minor units");
  }
  const currency = normalizedCurrency(input.currency);
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Transfer currency must be a 3-letter ISO code");
  }
  const referenceKey = input.referenceKey.trim();
  if (!referenceKey) throw new Error("A transfer reference key is required");

  return [
    {
      merchantId: input.fromMerchantId,
      amountMinor: -input.amountMinor,
      currency,
      entryType: "internal_transfer_out",
      referenceKey: `${referenceKey}:out`,
    },
    {
      merchantId: input.toMerchantId,
      amountMinor: input.amountMinor,
      currency,
      entryType: "internal_transfer_in",
      referenceKey: `${referenceKey}:in`,
    },
  ];
}

export function validateTsPayReplay(input: {
  existingToMerchantId: number;
  existingAmountMinor: number;
  existingCurrency: string;
  existingNote: string | null;
  requestedToMerchantId: number;
  requestedAmountMinor: number;
  requestedCurrency: string;
  requestedNote: string | null;
}): void {
  const same =
    input.existingToMerchantId === input.requestedToMerchantId &&
    input.existingAmountMinor === input.requestedAmountMinor &&
    normalizedCurrency(input.existingCurrency) === normalizedCurrency(input.requestedCurrency) &&
    input.existingNote === input.requestedNote;

  if (!same) throw new Error("Idempotency key already belongs to a different transfer");
}

export function buildTsPayWithdrawalLedgerEntry(input: {
  merchantId: number;
  withdrawalId: number;
  amountMinor: number;
  currency: string;
  event: "reserve" | "release" | "paid";
}) {
  if (!validMerchantId(input.merchantId)) throw new Error("Invalid merchant");
  if (!Number.isSafeInteger(input.withdrawalId) || input.withdrawalId <= 0) throw new Error("Invalid withdrawal");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("Withdrawal amount must be positive minor units");
  const currency = normalizedCurrency(input.currency);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Withdrawal currency must be a 3-letter ISO code");

  const amountMinor =
    input.event === "reserve" ? input.amountMinor :
    input.event === "release" ? -input.amountMinor : 0;

  return {
    merchantId: input.merchantId,
    amountMinor,
    currency,
    entryType:
      input.event === "reserve" ? "withdrawal_reserve" :
      input.event === "release" ? "withdrawal_release" : "withdrawal_paid",
    referenceKey: `withdrawal:${input.withdrawalId}:${input.event}`,
  };
}
