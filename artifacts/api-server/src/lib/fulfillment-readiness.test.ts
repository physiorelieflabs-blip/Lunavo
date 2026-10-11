import { describe, expect, it } from "vitest";
import { evaluateFulfillmentReadiness } from "./fulfillment-readiness";

describe("supplier fulfillment readiness", () => {
  it("allows routing only when known positive cost and selling price meet the margin floor", () => {
    const result = evaluateFulfillmentReadiness("40.00", "60.00", "20");
    expect(result.eligible).toBe(true);
    expect(result.status).toBe("ready");
    expect(result.marginPercent).toBe(33.3333);
    expect(result.reason).toBeNull();
  });

  it("blocks unknown or invalid cost and price instead of treating missing margin as approved", () => {
    for (const [cost, price] of [[null, 60], ["", 60], ["invalid", 60], [40, null], [40, 0], [40, "bad"]] as const) {
      const result = evaluateFulfillmentReadiness(cost, price, 10);
      expect(result.eligible).toBe(false);
      expect(result.status).toBe("failed");
      expect(result.marginPercent === null || Number.isFinite(result.marginPercent)).toBe(true);
      expect(result.reason).toMatch(/missing or invalid/);
    }
  });

  it("blocks margins below the merchant threshold, including negative margins", () => {
    expect(evaluateFulfillmentReadiness(95, 100, 10).reason).toMatch(/below the configured minimum/);
    expect(evaluateFulfillmentReadiness(120, 100, 10).eligible).toBe(false);
  });

  it("fails closed on an invalid margin policy", () => {
    expect(evaluateFulfillmentReadiness(40, 60, "not-a-number").reason).toMatch(/minimum margin is invalid/);
    expect(evaluateFulfillmentReadiness(40, 60, 101).eligible).toBe(false);
  });

  it("accepts the exact configured margin floor", () => {
    const result = evaluateFulfillmentReadiness(80, 100, 20);
    expect(result.eligible).toBe(true);
    expect(result.marginPercent).toBe(20);
  });
});
