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

  it("rejects invalid, unsupported, zero, and greater-than-100-percent values", () => {
    expect(calculateDiscountMinorUnits({ subtotalMinor: 2500, kind: "percentage", value: "100.01", currencyMinorDigits: 2 })).toBeNull();
    expect(calculateDiscountMinorUnits({ subtotalMinor: 2500, kind: "percentage", value: "0", currencyMinorDigits: 2 })).toBeNull();
    expect(calculateDiscountMinorUnits({ subtotalMinor: 2500, kind: "fixed", value: "0", currencyMinorDigits: 2 })).toBeNull();
    expect(calculateDiscountMinorUnits({ subtotalMinor: 2500, kind: "bogus", value: "10.00", currencyMinorDigits: 2 })).toBeNull();
    expect(calculateDiscountMinorUnits({ subtotalMinor: 0, kind: "fixed", value: "10.00", currencyMinorDigits: 2 })).toBeNull();
  });
});
