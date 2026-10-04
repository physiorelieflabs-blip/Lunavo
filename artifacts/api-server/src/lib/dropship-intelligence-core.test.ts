import { describe, expect, it } from "vitest";
import { productEconomics, scoreSupplier, trackingGap } from "./dropship-intelligence-core";

describe("dropship intelligence core", () => {
  it("refuses false profitability when shipping cost is unknown", () => {
    const result = productEconomics({ sellingPriceMinor: 10000, supplierCostMinor: 4000, shippingCostMinor: null });
    expect(result.landedCostMinor).toBeNull();
    expect(result.viabilityScore).toBeLessThan(100);
    expect(result.reasons.join(" ")).toMatch(/shipping cost/i);
  });

  it("finds a healthy product with strong evidence", () => {
    const result = productEconomics({
      sellingPriceMinor: 10000,
      supplierCostMinor: 3000,
      shippingCostMinor: 1000,
      adSpendPerOrderMinor: 1000,
      supplierQualityScore: 90,
      supplierTrackingScore: 90,
      etaMaxDays: 8,
      refundRateBps: 150,
      targetMarginBps: 2000,
    });
    expect(result.decision).toBe("SCALE");
    expect(result.breakEvenCpaMinor).toBeGreaterThan(0);
    expect(result.breakEvenRoasX100).toBeGreaterThan(100);
  });

  it("grades supplier confidence from evidence volume", () => {
    expect(scoreSupplier({ qualityScore: 90, trackingScore: 90, observations: 2, fulfilledOrders: 1 }).confidence).toBe("low");
    expect(scoreSupplier({ qualityScore: 90, trackingScore: 90, observations: 15, fulfilledOrders: 10 }).confidence).toBe("high");
  });

  it("detects recorded tracking silence", () => {
    const now = new Date("2026-10-04T12:00:00Z");
    expect(trackingGap({ status: "in_transit", lastRecordedAt: "2026-10-01T12:00:00Z", now }).state).toBe("warning");
    expect(trackingGap({ status: "in_transit", lastRecordedAt: "2026-09-28T12:00:00Z", now }).state).toBe("critical");
  });
});
