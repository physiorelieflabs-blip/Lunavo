import { describe, expect, it } from "vitest";
import { buildAutonomousOpportunity, buildDailyAdSlots, rankAutonomousOpportunities } from "./autonomous-store-engine";

describe("autonomous store engine", () => {
  it("keeps pricing unavailable when authoritative market prices are missing", () => {
    const result = buildAutonomousOpportunity({
      externalKey: "supplier-1",
      productName: "Example product",
      currency: "USD",
      landedCostMinor: 1000,
      marketLowMinor: null,
      marketHighMinor: null,
      demand: 90,
      lowCompetition: 95,
      growth: 80,
      supplier: 90,
      marketFit: 90,
      risk: 5,
    });
    expect(result.maximumCommercialPriceMinor).toBeNull();
    expect(result.recommendedPriceMinor).toBeNull();
  });

  it("ranks high-demand and low-competition opportunities first", () => {
    const base = {
      currency: "USD",
      landedCostMinor: 1000,
      marketLowMinor: 1800,
      marketHighMinor: 2200,
      growth: 80,
      supplier: 85,
      marketFit: 90,
      risk: 5,
    } as const;
    const high = buildAutonomousOpportunity({ ...base, externalKey: "a", productName: "A", demand: 95, lowCompetition: 95 });
    const low = buildAutonomousOpportunity({ ...base, externalKey: "b", productName: "B", demand: 60, lowCompetition: 35 });
    expect(rankAutonomousOpportunities([low, high])[0].externalKey).toBe("a");
  });

  it("creates evenly distributed daily advertising slots", () => {
    const slots = buildDailyAdSlots(4, 8, 12);
    expect(slots).toHaveLength(4);
    expect(slots[0].getHours()).toBe(8);
    expect(slots[3].getHours()).toBe(11);
    expect(buildDailyAdSlots(0)).toEqual([]);
  });
});
