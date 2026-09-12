import { describe, expect, it } from "vitest";
import {
  buildVerifiedTransactionMetadata,
  validateTsPayTransaction,
} from "./ts-pay-transaction-orchestrator";

describe("TS Pay transaction boundary", () => {
  it("normalizes currency and calculates merchant net", () => {
    const result = validateTsPayTransaction({
      merchantId: 7,
      kind: "sale",
      amountMinor: 10000,
      currency: "usd",
      idempotencyKey: "order:123",
      providerFeeMinor: 150,
      lunavoFeeMinor: 100,
    });
    expect(result.currency).toBe("USD");
    expect(result.merchantNetMinor).toBe(9750);
    expect(result.internalReference).toContain("ts-transfer:7:order:123");
  });

  it("rejects fees greater than the transaction", () => {
    expect(() => validateTsPayTransaction({
      merchantId: 7,
      kind: "sale",
      amountMinor: 100,
      currency: "USD",
      idempotencyKey: "order:124",
      providerFeeMinor: 80,
      lunavoFeeMinor: 21,
    })).toThrow("Transaction fees cannot exceed transaction amount");
  });

  it("marks provider verification explicitly", () => {
    const metadata = buildVerifiedTransactionMetadata({
      verifiedBy: "flutterwave",
      providerReference: "FLW-123",
    });
    expect(metadata.verified).toBe(true);
    expect(metadata.verifiedBy).toBe("flutterwave");
    expect(metadata.providerReference).toBe("FLW-123");
  });
});
