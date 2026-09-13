export type TsPayLedgerPosting = {
  merchantId: number;
  amountMinor: number;
  currency: string;
  entryType: "internal_transfer_out" | "internal_transfer_in";
  referenceKey: string;
};

export type TsPayWithdrawalLedgerEvent = "reserve" | "release" | "paid";

function normalizeCurrency(currency: string) {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Currency must be a 3-letter ISO code");
  return normalized;
}

export function buildTsPayWithdrawalLedgerEntry(input: {
  merchantId: number;
  withdrawalId: number;
  amountMinor: number;
  currency: string;
  event: TsPayWithdrawalLedgerEvent;
}) {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Withdrawal amount must be positive minor units");
  }
  const amountMinor = input.event === "reserve" ? -input.amountMinor : input.event === "release" ? input.amountMinor : 0;
  return { merchantId: input.merchantId, withdrawalId: input.withdrawalId, amountMinor, currency: normalizeCurrency(input.currency), entryType: `withdrawal_${input.event}` as const, referenceKey: `withdrawal:${input.withdrawalId}:${input.event}` };
}

export function tsPayReferenceKey(merchantId: number, idempotencyKey: string) {
  const key = idempotencyKey.trim();
  if (!key) throw new Error("Transfer idempotency key is required");
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) throw new Error("Invalid merchant");
  return `ts-transfer:${merchantId}:${key}`;
}

export function tsPayAmountMinor(amount: number) {
  const amountMinor = Math.round(amount * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Transfer amount must be positive");
  return amountMinor;
}

export function tsPayAvailableMinor(input: { ledgerBalanceMinor: number; withdrawalHoldMinor: number; earningsHeldMinor: number }) {
  const available = input.ledgerBalanceMinor - input.withdrawalHoldMinor - input.earningsHeldMinor;
  return Math.max(0, available);
}

export function validateTsPayTransfer(input: { fromMerchantId?: number; toMerchantId?: number; fromCurrency: string; toCurrency: string; requestedCurrency: string; amountMinor: number; availableMinor: number }) {
  if (input.fromMerchantId != null && input.toMerchantId != null && input.fromMerchantId === input.toMerchantId) throw new Error("TS Pay transfers require different merchant accounts");
  const requested = normalizeCurrency(input.requestedCurrency);
  if (normalizeCurrency(input.fromCurrency) !== requested || normalizeCurrency(input.toCurrency) !== requested) throw new Error("TS Pay transfers require both accounts to use the same currency");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("Transfer amount must be positive minor units");
  if (!Number.isSafeInteger(input.availableMinor) || input.amountMinor > input.availableMinor) throw new Error(`Only ${Math.max(0, input.availableMinor / 100).toFixed(2)} ${requested} is available to transfer`);
}

export function validateTsPayReplay(input: { existingToMerchantId: number; existingAmountMinor: number; existingCurrency: string; existingNote: string | null; requestedToMerchantId: number; requestedAmountMinor: number; requestedCurrency: string; requestedNote: string | null }) {
  if (input.existingToMerchantId !== input.requestedToMerchantId || input.existingAmountMinor !== input.requestedAmountMinor || normalizeCurrency(input.existingCurrency) !== normalizeCurrency(input.requestedCurrency) || input.existingNote !== input.requestedNote) throw new Error("This idempotency key was already used for a different transfer");
}

export function buildTsPayLedgerPostings(input: { fromMerchantId: number; toMerchantId: number; amountMinor: number; currency: string; referenceKey: string }): [TsPayLedgerPosting, TsPayLedgerPosting] {
  if (!Number.isSafeInteger(input.fromMerchantId) || !Number.isSafeInteger(input.toMerchantId) || input.fromMerchantId <= 0 || input.toMerchantId <= 0 || input.fromMerchantId === input.toMerchantId) throw new Error("TS Pay transfers require two different valid merchant accounts");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("Transfer amount must be positive minor units");
  const currency = normalizeCurrency(input.currency);
  const referenceKey = input.referenceKey.trim();
  if (!referenceKey) throw new Error("Ledger reference key is required");
  return [
    { merchantId: input.fromMerchantId, amountMinor: -input.amountMinor, currency, entryType: "internal_transfer_out", referenceKey: `${referenceKey}:out` },
    { merchantId: input.toMerchantId, amountMinor: input.amountMinor, currency, entryType: "internal_transfer_in", referenceKey: `${referenceKey}:in` },
  ];
}