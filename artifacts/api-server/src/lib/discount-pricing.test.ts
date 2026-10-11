import { describe, expect, it } from "vitest";
import { calculateDiscountMinorUnits } from "./discount-pricing";

describe("server-side discount arithmetic", () => {
  it("calculates percentage discounts using integer arithmetic", () => {
    expect(calculateDiscountMinorUnits({ subtotalMinor: 999, kind: "percentage", value: "10.00", currencyMinorDigits: 2 })).toBe(99);
    expect(calculateDiscountMinorUnits({ subtotalMinor: 100_00, kind: "percentage", value: "12.50", currencyMinorDigits: 2 })).toBe(1250);
  });

  it("caps fixed discounts at the order subtotal", () => {
    expect(calculateDiscountMinorUnits({ subtotalMinor: 2500, kind: "fixed", value: "50.00", currencyMinorDigits: 2 })).toBe(2500);
  });

  it("supports same-SKU buy-X-get-Y-free using exact unit minor units", () => {
    const base = { subtotalMinor: 5_000, kind: "bogo", value: "0", currencyMinorDigits: 2, unitPriceMinor: 1_000 };
    expect(calculateDiscountMinorUnits({ ...base, quantity: 1, buyQuantity: 1, getQuantity: 1 })).toBeNull();
    expect(calculateDiscountMinorUnits({ ...base, quantity: 2, buyQuantity: 1, getQuantity: 1 })).toBe(1_000);
    expect(calculateDiscountMinorUnits({ ...base, quantity: 3, buyQuantity: 1, getQuantity: 1 })).toBe(1_000);
    expect(calculateDiscountMinorUnits({ ...base, quantity: 4, buyQuantity: 1, getQuantity: 1 })).toBe(2_000);
    expect(calculateDiscountMinorUnits({ ...base, quantity: 5, buyQuantity: 2, getQuantity: 1 })).toBe(1_000);
    expect(calculateDiscountMinorUnits({ ...base, subtotalMinor: 1_500, quantity: 6, buyQuantity: 2, getQuantity: 1 })).toBe(1_500);
  });

  it("rejects BOGO terms that are malformed, out of range, or not eligible", () => {
    const base = { subtotalMinor: 5_000, kind: "bogo", value: "0", currencyMinorDigits: 2, unitPriceMinor: 1_000, quantity: 3 };
    expect(calculateDiscountMinorUnits({ ...base, buyQuantity: 3, getQuantity: 1 })).toBeNull();
    expect(calculateDiscountMinorUnits({ ...base, buyQuantity: 0, getQuantity: 1 })).toBeNull();
    expect(calculateDiscountMinorUnits({ ...base, buyQuantity: 1, getQuantity: 0 })).toBeNull();
    expect(calculateDiscountMinorUnits({ ...base, buyQuantity: 101, getQuantity: 1 })).toBeNull();
    expect(calculateDiscountMinorUnits({ ...base, unitPriceMinor: -1, buyQuantity: 1, getQuantity: 1 })).toBeNull();
    expect(calculateDiscountMinorUnits({ ...base, quantity: Number.MAX_SAFE_INTEGER, buyQuantity: 1, getQuantity: 1 })).toBeNull();
  });

  it("rejects invalid, unsupported, zero, and greater-than-100-percent values", () => {
    expect(calculateDiscountMinorUnits({ subtotalMinor: 2500, kind: "percentage", value: "100.01", currencyMinorDigits: 2 })).toBeNull();
    expect(calculateDiscountMinorUnits({ subtotalMinor: 2500, kind: "percentage", value: "0", currencyMinorDigits: 2 })).toBeNull();
    expect(calculateDiscountMinorUnits({ subtotalMinor: 2500, kind: "fixed", value: "0", currencyMinorDigits: 2 })).toBeNull();
    expect(calculateDiscountMinorUnits({ subtotalMinor: 2500, kind: "bogus", value: "10.00", currencyMinorDigits: 2 })).toBeNull();
    expect(calculateDiscountMinorUnits({ subtotalMinor: 0, kind: "fixed", value: "10.00", currencyMinorDigits: 2 })).toBeNull();
  });
});
