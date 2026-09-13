import { describe, expect, it } from "vitest";
import { buildAuctioneerStrategy } from "./auctioneer-ai";

describe("buildAuctioneerStrategy", () => {
  it("protects the seller floor before treating a stalled auction as a growth opportunity", () => {
    const result = buildAuctioneerStrategy({
      askingPrice: 1000,
      currency: "USD",
      currentBid: 700,
      bidCount: 3,
      hoursRemaining: 24,
      historicalBidVelocity: 0,
      minimumAcceptablePrice: 900,
      bidHistory: [],
    }, "maximize_value");

    expect(result.posture).toBe("protect_floor");
    expect(result.actions[0]).toContain("seller floor");
  });

  it("adapts the recommended increment from real bid spacing", () => {
    const now = Date.now();
    const result = buildAuctioneerStrategy({
      askingPrice: 1000,
      currency: "USD",
      currentBid: 1250,
      bidCount: 3,
      hoursRemaining: 10,
      historicalBidVelocity: 0,
      bidHistory: [
        { amount: 1050, createdAt: new Date(now - 30 * 60 * 1000), bidderKey: "a" },
        { amount: 1150, createdAt: new Date(now - 20 * 60 * 1000), bidderKey: "b" },
        { amount: 1250, createdAt: new Date(now - 10 * 60 * 1000), bidderKey: "c" },
      ],
    }, "balanced");

    expect(result.recommendedBidIncrement).toBeGreaterThan(0);
    expect(result.bidAnalysis.latestIncrement).toBe(100);
    expect(result.bidAnalysis.uniqueBidders).toBe(3);
    expect(result.guardrails.join(" ")).toContain("fake bidders");
  });
});
