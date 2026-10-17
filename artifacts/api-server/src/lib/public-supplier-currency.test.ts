import { describe, expect, it } from "vitest";
import { isSupportedSupplierCurrency } from "./public-supplier";

describe("supplier import currency validation", () => {
  it("accepts currencies beyond the original short list", () => {
    for (const currency of ["USD", "NGN", "JPY", "CNY", "INR", "CHF", "XAF", "BRL", "MXN"]) {
      expect(isSupportedSupplierCurrency(currency), currency).toBe(true);
    }
  });

  it("normalizes whitespace and lowercase currency codes", () => {
    expect(isSupportedSupplierCurrency(" jpy ")).toBe(true);
    expect(isSupportedSupplierCurrency("ngn")).toBe(true);
  });

  it("rejects malformed and unrecognized currency codes", () => {
    for (const currency of ["", "US", "USDD", "12N", "ZZZ", "ABC", "USD/NGN"]) {
      expect(isSupportedSupplierCurrency(currency), currency).toBe(false);
    }
  });
});
