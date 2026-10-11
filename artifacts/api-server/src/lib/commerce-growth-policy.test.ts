import { describe, expect, it } from "vitest";
import { parseStorefrontId, parseSupplierProductId, quoteProductAdvertisingFee } from "./commerce-growth-policy";
import type { FxRateSet } from "./fx-rates";

const now = Date.parse("2026-10-11T12:00:00.000Z");
const rates: FxRateSet = {
  unitsPerUsd: { USD: 1, NGN: 1500, JPY: 150, KWD: 0.31 },
  asOfByCurrency: {
    NGN: "2026-10-10T12:00:00.000Z",
    JPY: "2026-10-10T12:00:00.000Z",
    KWD: "2026-10-10T12:00:00.000Z",
  },
  sourceByCurrency: {
    NGN: "Central Bank of Nigeria NFEM",
    JPY: "European Central Bank reference rates",
    KWD: "European Central Bank reference rates",
  },
};

describe("commerce growth request identifiers", () => {
  it("parses actual serial supplier-product IDs supplied as numbers or numeric strings", () => {
    expect(parseSupplierProductId(12)).toBe(12);
    expect(parseSupplierProductId("12")).toBe(12);
    expect(parseSupplierProductId(" 12 ")).toBe(12);
    expect(parseSupplierProductId("00012")).toBeNull();
    expect(parseSupplierProductId("12.5")).toBeNull();
    expect(parseSupplierProductId("1e2")).toBeNull();
    expect(parseSupplierProductId("550e8400-e29b-41d4-a716-446655440000")).toBeNull();
    expect(parseSupplierProductId(0)).toBeNull();
    expect(parseSupplierProductId(2_147_483_648)).toBeNull();
    expect(parseSupplierProductId({ id: 12 })).toBeNull();
  });

  it("accepts only UUIDs for storefront IDs", () => {
    expect(parseStorefrontId("550e8400-e29b-41d4-a716-446655440000")).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(parseStorefrontId("12")).toBeNull();
    expect(parseStorefrontId("not-a-uuid")).toBeNull();
    expect(parseStorefrontId(null)).toBeNull();
  });
});

describe("campaign fee FX quotes", () => {
  it("converts the USD 5 advertising fee into the merchant currency with rate provenance", () => {
    const quote = quoteProductAdvertisingFee("NGN", rates, now);
    expect(quote.baseAmountMinor).toBe(500);
    expect(quote.currency).toBe("NGN");
    expect(quote.feeMinor).toBe(750_000);
    expect(quote.fxRate).toBe(1500);
    expect(quote.fxSource).toContain("Central Bank of Nigeria");
    expect(quote.fxAsOf).toBe("2026-10-10T12:00:00.000Z");
  });

  it("uses the correct minor-unit exponent for zero-decimal and three-decimal currencies", () => {
    expect(quoteProductAdvertisingFee("JPY", rates, now).feeMinor).toBe(750);
    expect(quoteProductAdvertisingFee("KWD", rates, now).feeMinor).toBe(1550);
  });

  it("fails closed if a non-USD currency has no fresh local FX evidence", () => {
    expect(() => quoteProductAdvertisingFee("GHS", rates, now)).toThrow(/fresh locally stored FX rate/);
    const stale = { ...rates, asOfByCurrency: { ...rates.asOfByCurrency, NGN: "2026-10-01T12:00:00.000Z" } };
    expect(() => quoteProductAdvertisingFee("NGN", stale, now)).toThrow(/fresh locally stored FX rate/);
  });

  it("does not require an external or stored quote for USD itself", () => {
    const quote = quoteProductAdvertisingFee("USD", rates, now);
    expect(quote.feeMinor).toBe(500);
    expect(quote.fxRate).toBe(1);
  });
});
