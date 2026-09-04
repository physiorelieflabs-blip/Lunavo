export type TsPayLedgerPosting = {
  merchantId: number;
  amountMinor: number;
  currency: string;
  entryType: "internal_transfer_out" | "internal_transfer_in";
  referenceKey: string;
};

export type TsPayWithdrawalLedgerEvent = "reserve" | "release" | "paid";

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
  const amountMinor =
    input.event === "reserve"
      ? -input.amountMinor
      : input.event === "release"
        ? input.amountMinor
        : 0;
  return {
    merchantId: input.merchantId,
    withdrawalId: input.withdrawalId,
    amountMinor,
    currency: input.currency,
    entryType: `withdrawal_${input.event}` as const,
    referenceKey: `withdrawal:${input.withdrawalId}:${input.event}`,
  };
}

export function tsPayReferenceKey(merchantId: number, idempotencyKey: string) {
  const key = idempotencyKey.trim();
  if (!key) throw new Error("Transfer idempotency key is required");
  return `ts-transfer:${merchantId}:${key}`;
}

export function tsPayAmountMinor(amount: number) {
  const amountMinor = Math.round(amount * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("Transfer amount must be positive");
  }
  return amountMinor;
}

export function tsPayAvailableMinor(input: {
  ledgerBalanceMinor: number;
  withdrawalHoldMinor: number;
  earningsHeldMinor: number;
}) {
  return input.ledgerBalanceMinor - input.withdrawalHoldMinor - input.earningsHeldMinor;
}

export function validateTsPayTransfer(input: {
  fromCurrency: string;
  toCurrency: string;
  requestedCurrency: string;
  amountMinor: number;
  availableMinor: number;
}) {
  if (input.fromCurrency !== input.requestedCurrency || input.toCurrency !== input.requestedCurrency) {
    throw new Error("TS Pay transfers require both accounts to use the same currency");
  }
  if (input.amountMinor > input.availableMinor) {
    throw new Error(`Only ${Math.max(0, input.availableMinor / 100).toFixed(2)} ${input.requestedCurrency} is available to transfer`);
  }
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
}) {
  if (
    input.existingToMerchantId !== input.requestedToMerchantId
    || input.existingAmountMinor !== input.requestedAmountMinor
    || input.existingCurrency !== input.requestedCurrency
    || input.existingNote !== input.requestedNote
  ) {
    throw new Error("This idempotency key was already used for a different transfer");
  }
}

export function buildTsPayLedgerPostings(input: {
  fromMerchantId: number;
  toMerchantId: number;
  amountMinor: number;
  currency: string;
  referenceKey: string;
}): [TsPayLedgerPosting, TsPayLedgerPosting] {
  return [
    {
      merchantId: input.fromMerchantId,
      amountMinor: -input.amountMinor,
      currency: input.currency,
      entryType: "internal_transfer_out",
      referenceKey: `${input.referenceKey}:out`,
    },
    {
      merchantId: input.toMerchantId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      entryType: "internal_transfer_in",
      referenceKey: `${input.referenceKey}:in`,
    },
  ];
}