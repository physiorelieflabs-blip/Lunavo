import { describe, expect, it } from "vitest";
import { recommendPrice } from "./automation-intelligence";

describe("shared evidence-based opportunity pricing", () => {
  const base = {
    supplierCostMinor: 5_000,
    shippingMinor: 400,
    taxMinor: 100,
    feeMinor: 100,
    minimumMarginPercent: 20,
    marketLowMinor: 8_000,
    marketHighMinor: 12_000,
  };

  it("uses the same deterministic floor and market ceiling as dynamic pricing", () => {
    const result = recommendPrice(base);
    expect(result.pricingStatus).toBe("evidence_backed");
    if (result.recommendedPriceMinor === null || result.maximumCommercialPriceMinor === null) throw new Error("Expected a price supported by market evidence");
    expect(result.recommendedPriceMinor).toBeGreaterThanOrEqual(result.minimumViablePriceMinor);
    expect(result.recommendedPriceMinor).toBeLessThanOrEqual(result.maximumCommercialPriceMinor);
  });

  it("does not invent a price without market evidence", () => {
    const result = recommendPrice({ ...base, marketLowMinor: undefined, marketHighMinor: undefined });
    expect(result.recommendedPriceMinor).toBeNull();
    expect(result.maximumCommercialPriceMinor).toBeNull();
    expect(result.pricingStatus).toBe("insufficient_market_evidence");
  });

  it("returns no recommendation when the market cannot support the margin floor", () => {
    const result = recommendPrice({ ...base, marketLowMinor: 5_000, marketHighMinor: 6_000 });
    expect(result.recommendedPriceMinor).toBeNull();
    expect(result.pricingStatus).toBe("market_below_floor");
  });

  it("enforces a configured maximum multiplier without selling below the required floor", () => {
    const result = recommendPrice({ ...base, maxPriceMultiplier: 1.05 });
    expect(result.recommendedPriceMinor).toBeNull();
    expect(result.pricingStatus).toBe("incompatible_price_limits");
  });

  it("rejects unsafe money and invalid limits", () => {
    expect(() => recommendPrice({ ...base, feeMinor: -1 })).toThrow(/Fee/);
    expect(() => recommendPrice({ ...base, maxPriceMultiplier: 0 })).toThrow(/multiplier/);
  });
});
