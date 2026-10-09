import { describe, expect, it } from "vitest";
import { availableMerchantStock, confidenceFor, conversionRateBps, churnRisk, nextBestAction, partialSourceMarginBps, segment, selectUniqueComparableLandedScenario, supplierStockIsAtRisk } from "./dropship-intelligence";

describe("dropship intelligence decision rules", () => {
  it("uses exactly one currency-and-price-matched landed-cost scenario and rejects ambiguity", () => {
    const scenarios = [
      { id: "ng", currency: "NGN", sellingPriceMinor: 10_000, contributionMarginBps: 2_000 },
      { id: "gb", currency: "GBP", sellingPriceMinor: 10_000, contributionMarginBps: 3_000 },
    ];
    expect(selectUniqueComparableLandedScenario(scenarios, "NGN", 10_000)?.id).toBe("ng");
    expect(selectUniqueComparableLandedScenario(scenarios, "NGN", 11_000)).toBeNull();
    expect(selectUniqueComparableLandedScenario(scenarios, "USD", 10_000)).toBeNull();
    expect(selectUniqueComparableLandedScenario([...scenarios, { ...scenarios[0]!, id: "ng-other" }], "NGN", 10_000)).toBeNull();
    expect(selectUniqueComparableLandedScenario(scenarios, "NGN", 0)).toBeNull();
  });

  it("calculates purchase-per-click conversion in basis points and rejects invalid denominators", () => {
    expect(conversionRateBps(2, 100)).toBe(200);
    expect(conversionRateBps(1, 20)).toBe(500);
    expect(conversionRateBps(2, 0)).toBeNull();
    expect(conversionRateBps(-1, 10)).toBeNull();
    expect(conversionRateBps(2, Number.MAX_SAFE_INTEGER + 1)).toBeNull();
  });

  it("raises confidence as observed order count grows but keeps it bounded", () => {
    expect(confidenceFor(0)).toBe(2500);
    expect(confidenceFor(10)).toBeGreaterThan(confidenceFor(1));
    expect(confidenceFor(10)).toBeLessThanOrEqual(9200);
  });

  it("classifies lifecycle segments from recency, orders and value", () => {
    expect(segment(0, 0, 5)).toBe("new");
    expect(segment(2, 50_000, 20)).toBe("loyal");
    expect(segment(6, 20_000, 20)).toBe("vip");
    expect(segment(2, 250_000, 20)).toBe("loyal");
    expect(segment(2, 250_000, 20, true)).toBe("vip");
    expect(segment(2, 50_000, 75)).toBe("at_risk");
    expect(segment(2, 50_000, 140)).toBe("lapsed");
  });

  it("never recommends marketing without consent", () => {
    expect(nextBestAction("vip", false, 100)).toBe("observe");
    expect(nextBestAction("lapsed", true, 9000)).toBe("winback");
    expect(nextBestAction("loyal", true, 700)).toBe("cross_sell");
  });

  it("keeps churn risk monotonic for the same customer archetype", () => {
    expect(churnRisk(3, 15)).toBeLessThan(churnRisk(3, 60));
    expect(churnRisk(3, 60)).toBeLessThan(churnRisk(3, 140));
  });
});


describe("connected dropship risk boundaries", () => {
  it("never converts supplier stock into merchant-owned stock", () => {
    expect(availableMerchantStock(null, 0)).toBeNull();
    expect(availableMerchantStock(12, 4)).toBe(8);
    expect(availableMerchantStock(3, 8)).toBe(0);
    expect(availableMerchantStock(Number.MAX_SAFE_INTEGER + 1, 0)).toBeNull();
  });

  it("flags supplier stock risk conservatively without pretending unknown means empty", () => {
    expect(supplierStockIsAtRisk("out of stock", null, 4)).toBe(true);
    expect(supplierStockIsAtRisk("available", 0, 4)).toBe(true);
    expect(supplierStockIsAtRisk("available", 2, 4)).toBe(true);
    expect(supplierStockIsAtRisk("in stock", null, 4)).toBe(false);
    expect(supplierStockIsAtRisk("in stock", 100, 4)).toBe(false);
  });

  it("uses exact rounded platform fee and suppresses incomparable or invalid margin data", () => {
    expect(partialSourceMarginBps(10_000, 4_000, true)).toBe(5_900);
    expect(partialSourceMarginBps(10_050, 4_000, true)).toBe(5_919);
    expect(partialSourceMarginBps(10_000, 4_000, false)).toBeNull();
    expect(partialSourceMarginBps(0, 4_000, true)).toBeNull();
    expect(partialSourceMarginBps(10_000, -1, true)).toBeNull();
  });
});
