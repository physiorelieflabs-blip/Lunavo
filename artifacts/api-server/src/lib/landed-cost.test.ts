import { describe, expect, it } from "vitest";
import { calculateLandedCost, type LandedCostInput } from "./landed-cost";

const baseInput: LandedCostInput = {
  sourceCostMinor: 10_000,
  outboundShippingMinor: 1_000,
  freightMinor: 500,
  insuranceMinor: 100,
  handlingMinor: 200,
  packagingMinor: 100,
  sellingPriceMinor: 30_000,
  customsDutyBps: 500,
  importTaxBps: 1_000,
  platformFeeBps: 100,
  providerFeeBps: 290,
  returnsReserveBps: 300,
};

describe("evidence-qualified landed cost calculator", () => {
  it("uses integer minor-unit arithmetic for duty, tax, fees and contribution", () => {
    expect(calculateLandedCost(baseInput)).toEqual({
      dutiableBaseMinor: 11_600,
      customsDutyMinor: 580,
      importTaxBaseMinor: 12_480,
      importTaxMinor: 1_248,
      landedCostMinor: 13_728,
      platformFeeMinor: 300,
      providerFeeMinor: 870,
      returnsReserveMinor: 900,
      contributionMarginMinor: 14_202,
      contributionMarginBps: 4_734,
      profitability: "profitable",
      calculationVersion: "landed-cost-v1",
    });
  });

  it("does not label a loss as profitable", () => {
    const result = calculateLandedCost({ ...baseInput, sellingPriceMinor: 5_000 });
    expect(result.profitability).toBe("loss");
    expect(result.contributionMarginMinor).toBeLessThan(0);
  });

  it("rejects non-integer and negative money inputs", () => {
    expect(() => calculateLandedCost({ ...baseInput, sourceCostMinor: 1.25 })).toThrow(/safe integer/i);
    expect(() => calculateLandedCost({ ...baseInput, freightMinor: -1 })).toThrow(/safe integer/i);
    expect(() => calculateLandedCost({ ...baseInput, providerFeeBps: 10_001 })).toThrow(/basis points/i);
  });

  it("rejects arithmetic values outside JavaScript's exact integer range", () => {
    expect(() => calculateLandedCost({
      ...baseInput,
      sourceCostMinor: Number.MAX_SAFE_INTEGER,
      outboundShippingMinor: Number.MAX_SAFE_INTEGER,
    })).toThrow(/exact-integer range/i);
  });
});
