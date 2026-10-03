import { tsPayReferenceKey } from "./ts-pay-ledger";

export type TsPayTransactionKind =
  | "sale"
  | "auction_acquisition"
  | "subscription"
  | "refund"
  | "withdrawal"
  | "internal_transfer";

export type TsPayTransactionInput = {
  merchantId: number;
  kind: TsPayTransactionKind;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  provider?: string | null;
  providerReference?: string | null;
  providerFeeMinor?: number;
  lunavoFeeMinor?: number;
  counterpartyMerchantId?: number | null;
  metadata?: Record<string, unknown>;
};

/**
 * Canonical transaction boundary for Lunavo financial flows.
 *
 * This module deliberately does not move money itself. Provider adapters verify
 * external settlement; callers then post the verified economic event through
 * this boundary before it becomes dashboard/ledger-visible revenue.
 */
export function validateTsPayTransaction(input: TsPayTransactionInput) {
  if (!Number.isSafeInteger(input.merchantId) || input.merchantId <= 0) {
    throw new Error("A valid merchant is required");
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Transaction amount must be positive minor units");
  }
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Transaction currency must be a 3-letter ISO code");
  if (!input.idempotencyKey.trim()) throw new Error("Transaction idempotency key is required");

  const providerFeeMinor = input.providerFeeMinor ?? 0;
  const lunavoFeeMinor = input.lunavoFeeMinor ?? 0;
  if (!Number.isSafeInteger(providerFeeMinor) || providerFeeMinor < 0) {
    throw new Error("Provider fee must be a non-negative integer");
  }
  if (!Number.isSafeInteger(lunavoFeeMinor) || lunavoFeeMinor < 0) {
    throw new Error("Lunavo fee must be a non-negative integer");
  }
  if (providerFeeMinor + lunavoFeeMinor > input.amountMinor) {
    throw new Error("Transaction fees cannot exceed transaction amount");
  }

  return {
    ...input,
    currency,
    providerFeeMinor,
    lunavoFeeMinor,
    merchantNetMinor: input.amountMinor - providerFeeMinor - lunavoFeeMinor,
    internalReference: tsPayReferenceKey(input.merchantId, input.idempotencyKey),
  };
}

export function buildVerifiedTransactionMetadata(input: {
  verifiedBy: "flutterwave" | "paystack" | "stripe" | "paypal" | "internal";
  providerReference?: string | null;
  verificationTimestamp?: string;
  source?: string;
}) {
  return {
    verified: true,
    verifiedBy: input.verifiedBy,
    providerReference: input.providerReference ?? null,
    verificationTimestamp: input.verificationTimestamp ?? new Date().toISOString(),
    source: input.source ?? "ts_pay",
  };
}
