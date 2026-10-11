import { describe, expect, it } from "vitest";
import { shouldApplySupplierPriceFields } from "./supplier-sync-policy";

describe("supplier price synchronization policy", () => {
  it("does not mutate product prices when price sync is disabled", () => {
    expect(shouldApplySupplierPriceFields(false, "USD", "USD", 1250)).toBe(false);
  });

  it("accepts a positive parsed price only when supplier and product currencies match", () => {
    expect(shouldApplySupplierPriceFields(true, "NGN", "ngn", 125000)).toBe(true);
    expect(shouldApplySupplierPriceFields(true, "USD", "GBP", 1250)).toBe(false);
  });

  it("keeps current price/currency intact when the source price is absent, zero, or invalid", () => {
    expect(shouldApplySupplierPriceFields(true, "USD", "USD", null)).toBe(false);
    expect(shouldApplySupplierPriceFields(true, "USD", "USD", 0)).toBe(false);
    expect(shouldApplySupplierPriceFields(true, "USD", "USD", Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  it("rejects malformed or missing currency codes", () => {
    expect(shouldApplySupplierPriceFields(true, "US", "USD", 100)).toBe(false);
    expect(shouldApplySupplierPriceFields(true, "USD", null, 100)).toBe(false);
  });
});
