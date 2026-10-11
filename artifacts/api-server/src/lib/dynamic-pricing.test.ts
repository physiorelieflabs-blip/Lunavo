import { describe, expect, it } from "vitest";
import { recommendDynamicPrice } from "./dynamic-pricing";
const base = { supplierCostMinor: 5_000, shippingMinor: 500, fixedFeesMinor: 100, percentageFeeBps: 300, targetMarginPercent: 20, marketLowMinor: 8_000, marketHighMinor: 12_000 };
describe("evidence-based dynamic pricing", () => {
  it("keeps recommendations within the viable floor and evidenced ceiling", () => {
    const r = recommendDynamicPrice(base);
    expect(r.pricingStatus).toBe("evidence_backed");
    expect(r.recommendedPriceMinor).not.toBeNull();
    expect(r.recommendedPriceMinor!).toBeGreaterThanOrEqual(r.floorPriceMinor);
    expect(r.recommendedPriceMinor!).toBeLessThanOrEqual(r.maximumCommercialPriceMinor!);
  });
  it("does not recommend below a viable floor when the configured cap is too low", () => {
    const r = recommendDynamicPrice({ ...base, maxPriceMinor: 5_500 });
    expect(r.recommendedPriceMinor).toBeNull();
    expect(r.pricingStatus).toBe("incompatible_price_limits");
    expect(r.floorPriceMinor).toBeGreaterThan(5_500);
  });
  it("does not claim an uneconomic market ceiling is viable", () => {
    const r = recommendDynamicPrice({ ...base, marketLowMinor: 5_500, marketHighMinor: 6_000 });
    expect(r.recommendedPriceMinor).toBeNull();
    expect(r.pricingStatus).toBe("market_below_floor");
    expect(r.maximumCommercialPriceMinor).toBe(6_000);
  });
  it("does not invent market prices when evidence is missing", () => {
    const r = recommendDynamicPrice({ ...base, marketLowMinor: undefined, marketHighMinor: undefined });
    expect(r.recommendedPriceMinor).toBeNull();
    expect(r.maximumCommercialPriceMinor).toBeNull();
    expect(r.pricingStatus).toBe("insufficient_market_evidence");
  });
  it("rejects invalid money and fee inputs", () => {
    expect(() => recommendDynamicPrice({ ...base, shippingMinor: -1 })).toThrow(/Shipping/);
    expect(() => recommendDynamicPrice({ ...base, maxPriceMinor: 12_000.5 })).toThrow(/Maximum price/);
    expect(() => recommendDynamicPrice({ ...base, percentageFeeBps: 10_000 })).toThrow(/Percentage fees/);
  });
});
