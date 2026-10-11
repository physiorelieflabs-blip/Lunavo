import { describe, expect, it } from "vitest";
import { evaluateDiscountCode, type DiscountCodeRule } from "./discount-policy";

const now = new Date("2026-10-11T12:00:00.000Z");
const base: DiscountCodeRule = {
  id: 1,
  code: "SAVE10",
  kind: "percentage",
  value: "10.00",
  minimumSubtotal: "0.00",
  currency: "NGN",
  usageLimit: 3,
  usageCount: 1,
  startsAt: null,
  endsAt: null,
  active: true,
};

describe("server-authoritative checkout discounts", () => {
  it("calculates percentages in integer minor units", () => {
    expect(evaluateDiscountCode(base, { subtotalMinor: 12_345, currency: "NGN", reservedUses: 1, now }))
      .toEqual({ code: "SAVE10", subtotalMinor: 12_345, discountAmountMinor: 1_235 });
  });

  it("caps fixed discounts at the merchandise subtotal", () => {
    expect(evaluateDiscountCode({ ...base, kind: "fixed", value: "999.00" }, {
      subtotalMinor: 1_250, currency: "NGN", reservedUses: 0, now,
    }).discountAmountMinor).toBe(1_250);
  });

  const invalidCases: Array<[DiscountCodeRule, { subtotalMinor: number; currency: string; reservedUses: number; now: Date }, RegExp]> = [
    [{ ...base, active: false }, { subtotalMinor: 10_000, currency: "NGN", reservedUses: 0, now }, /inactive/],
    [base, { subtotalMinor: 10_000, currency: "USD", reservedUses: 0, now }, /only valid in NGN/],
    [{ ...base, startsAt: new Date("2026-10-12T00:00:00.000Z") }, { subtotalMinor: 10_000, currency: "NGN", reservedUses: 0, now }, /not active yet/],
    [{ ...base, endsAt: now }, { subtotalMinor: 10_000, currency: "NGN", reservedUses: 0, now }, /expired/],
    [{ ...base, minimumSubtotal: "200.00" }, { subtotalMinor: 10_000, currency: "NGN", reservedUses: 0, now }, /minimum subtotal/],
    [base, { subtotalMinor: 10_000, currency: "NGN", reservedUses: 2, now }, /usage limit/],
    [{ ...base, value: "101" }, { subtotalMinor: 10_000, currency: "NGN", reservedUses: 0, now }, /cannot exceed/],
  ];

  it.each(invalidCases)("rejects invalid or inapplicable rules", (rule, input, error) => {
    expect(() => evaluateDiscountCode(rule, input)).toThrow(error);
  });

  it("never discounts more than the merchandise subtotal", () => {
    const result = evaluateDiscountCode({ ...base, kind: "fixed", value: "50.00", usageLimit: null }, {
      subtotalMinor: 1_999, currency: "NGN", reservedUses: 0, now,
    });
    expect(result.discountAmountMinor).toBe(1_999);
  });
});
