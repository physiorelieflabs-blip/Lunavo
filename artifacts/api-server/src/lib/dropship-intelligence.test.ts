import { describe, expect, it } from "vitest";
import { confidenceFor, churnRisk, nextBestAction, segment } from "./dropship-intelligence";

describe("dropship intelligence decision rules", () => {
  it("raises confidence as observed order count grows but keeps it bounded", () => {
    expect(confidenceFor(0)).toBe(2500);
    expect(confidenceFor(10)).toBeGreaterThan(confidenceFor(1));
    expect(confidenceFor(10)).toBeLessThanOrEqual(9200);
  });

  it("classifies lifecycle segments from recency, orders and value", () => {
    expect(segment(0, 0, 5)).toBe("new");
    expect(segment(2, 50_000, 20)).toBe("loyal");
    expect(segment(6, 20_000, 20)).toBe("vip");
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
