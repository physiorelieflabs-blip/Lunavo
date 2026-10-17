import { describe, expect, it } from "vitest";
import { summarizeMarketWatchChange } from "./dropship-market-watch-diff";

describe("scheduled market-watch change detection", () => {
  it("ignores unchanged prices and case/whitespace-only availability differences", () => {
    const result = summarizeMarketWatchChange({
      previousPriceMinor: "1299",
      previousCurrency: "USD",
      previousAvailability: " In   Stock ",
      currentPriceMinor: 1299,
      currentCurrency: "USD",
      currentAvailability: "in stock",
    });
    expect(result.changed).toBe(false);
    expect(result.priceChanged).toBe(false);
    expect(result.availabilityChanged).toBe(false);
  });

  it("detects a listed-price or currency change without treating page data as verified", () => {
    const price = summarizeMarketWatchChange({
      previousPriceMinor: "1299",
      previousCurrency: "USD",
      previousAvailability: null,
      currentPriceMinor: 1399,
      currentCurrency: "USD",
      currentAvailability: null,
    });
    expect(price).toMatchObject({ changed: true, priceChanged: true, availabilityChanged: false });

    const currency = summarizeMarketWatchChange({
      previousPriceMinor: 1299,
      previousCurrency: "USD",
      previousAvailability: null,
      currentPriceMinor: 1299,
      currentCurrency: "EUR",
      currentAvailability: null,
    });
    expect(currency.priceChanged).toBe(true);
  });

  it("detects meaningful availability transitions but ignores unknown-to-unknown", () => {
    const available = summarizeMarketWatchChange({
      previousPriceMinor: null,
      previousCurrency: null,
      previousAvailability: null,
      currentPriceMinor: null,
      currentCurrency: "USD",
      currentAvailability: "In stock",
    });
    expect(available).toMatchObject({ changed: true, priceChanged: false, availabilityChanged: true });

    const stillUnknown = summarizeMarketWatchChange({
      previousPriceMinor: null,
      previousCurrency: null,
      previousAvailability: " ",
      currentPriceMinor: null,
      currentCurrency: "USD",
      currentAvailability: null,
    });
    expect(stillUnknown.changed).toBe(false);
  });

  it("detects a price becoming available or disappearing", () => {
    expect(summarizeMarketWatchChange({
      previousPriceMinor: null,
      previousCurrency: null,
      previousAvailability: null,
      currentPriceMinor: 100,
      currentCurrency: "NGN",
      currentAvailability: null,
    }).priceChanged).toBe(true);
    expect(summarizeMarketWatchChange({
      previousPriceMinor: "100",
      previousCurrency: "NGN",
      previousAvailability: null,
      currentPriceMinor: null,
      currentCurrency: "NGN",
      currentAvailability: null,
    }).priceChanged).toBe(true);
  });
});
