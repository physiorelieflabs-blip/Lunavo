import { describe, expect, it } from "vitest";
import { shouldApplySupplierPriceFields, shouldApplySupplierStockFields } from "./supplier-sync-policy";

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

describe("supplier stock synchronization policy", () => {
  it("updates only recognized stock observations when stock sync is enabled", () => {
    expect(shouldApplySupplierStockFields(true, "in_stock")).toBe(true);
    expect(shouldApplySupplierStockFields(true, "out_of_stock")).toBe(true);
    expect(shouldApplySupplierStockFields(true, "limited_stock")).toBe(true);
    expect(shouldApplySupplierStockFields(true, "preorder")).toBe(true);
  });

  it("does not erase known stock state after missing, disabled, or unrecognized observations", () => {
    expect(shouldApplySupplierStockFields(false, "in_stock")).toBe(false);
    expect(shouldApplySupplierStockFields(true, null)).toBe(false);
    expect(shouldApplySupplierStockFields(true, "")).toBe(false);
    expect(shouldApplySupplierStockFields(true, "unknown")).toBe(false);
  });
});
