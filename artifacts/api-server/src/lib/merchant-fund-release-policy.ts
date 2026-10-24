import { calculateTsCommerceFeeMinor } from "./critical-payment-rules";

export type MerchantFundReleaseVerification = {
  providerPaid: boolean;
  reversalOrDispute: boolean;
  observedTransactionId: string | null;
  expectedTransactionId: string;
  observedAmountMinor: number | null;
  expectedAmountMinor: number;
  observedCurrency: string;
  expectedCurrency: string;
  observedReference: string;
  expectedReference: string | null;
  observedProviderFeeMinor: number | null;
  expectedProviderFeeMinor: number;
  expectedLunavoFeeMinor: number;
  expectedMerchantNetMinor: number;
};

/** Return a safe operator-facing reason when fresh provider evidence cannot release proceeds. */
export function merchantFundReleaseVerificationFailure(
  input: MerchantFundReleaseVerification,
): string | null {
  if (!input.providerPaid) return "Provider payment is not successful.";
  if (!input.observedTransactionId || input.observedTransactionId !== input.expectedTransactionId) {
    return "Provider transaction ID does not match the release record.";
  }
  if (!Number.isSafeInteger(input.expectedAmountMinor) || input.expectedAmountMinor <= 0) {
    return "Stored gross amount is invalid.";
  }
  if (!Number.isSafeInteger(input.observedAmountMinor) || input.observedAmountMinor !== input.expectedAmountMinor) {
    return "Provider amount does not match the release record.";
  }
  if (!/^[A-Z]{3}$/.test(input.expectedCurrency) ||
      input.observedCurrency.trim().toUpperCase() !== input.expectedCurrency.toUpperCase()) {
    return "Provider currency does not match the release record.";
  }
  if (input.expectedReference && input.observedReference !== input.expectedReference) {
    return "Provider reference does not match the release record.";
  }
  if (!Number.isSafeInteger(input.expectedProviderFeeMinor) || input.expectedProviderFeeMinor < 0) {
    return "Stored provider fee is invalid.";
  }
  if (input.observedProviderFeeMinor !== null &&
      (!Number.isSafeInteger(input.observedProviderFeeMinor) ||
       input.observedProviderFeeMinor !== input.expectedProviderFeeMinor)) {
    return "Provider fee does not match the release record.";
  }
  if (!Number.isSafeInteger(input.expectedLunavoFeeMinor) || input.expectedLunavoFeeMinor < 0 ||
      input.expectedLunavoFeeMinor !== calculateTsCommerceFeeMinor(input.expectedAmountMinor)) {
    return "Lunavo fee does not match the configured transaction fee.";
  }
  if (!Number.isSafeInteger(input.expectedMerchantNetMinor) || input.expectedMerchantNetMinor < 0 ||
      input.expectedMerchantNetMinor !== input.expectedAmountMinor -
        input.expectedProviderFeeMinor - input.expectedLunavoFeeMinor) {
    return "Merchant net does not reconcile to gross and fee lines.";
  }
  if (input.reversalOrDispute) return "Provider reports a refund, reversal, chargeback, or dispute.";
  return null;
}
