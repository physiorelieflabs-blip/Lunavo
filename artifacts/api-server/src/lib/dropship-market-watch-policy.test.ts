import { describe, expect, it } from "vitest";
import {
  MAX_MARKET_WATCH_FAILURES,
  MAX_MARKET_WATCH_INTERVAL_MINUTES,
  MIN_MARKET_WATCH_INTERVAL_MINUTES,
  isValidMarketWatchInterval,
  marketWatchRetryDelaySeconds,
  marketWatchStatusAfterFailure,
} from "./dropship-market-watch-policy";

describe("scheduled market-watch policy", () => {
  it("bounds intervals between one hour and one day", () => {
    expect(isValidMarketWatchInterval(MIN_MARKET_WATCH_INTERVAL_MINUTES)).toBe(true);
    expect(isValidMarketWatchInterval(MAX_MARKET_WATCH_INTERVAL_MINUTES)).toBe(true);
    for (const value of [0, 1, 59, 1441, -60, 60.5, "60", null, Number.NaN]) {
      expect(isValidMarketWatchInterval(value), String(value)).toBe(false);
    }
  });

  it("backs off transient failures without exceeding the bounded delay", () => {
    expect(marketWatchRetryDelaySeconds(1)).toBe(30);
    expect(marketWatchRetryDelaySeconds(2)).toBe(60);
    expect(marketWatchRetryDelaySeconds(MAX_MARKET_WATCH_FAILURES)).toBe(480);
    expect(marketWatchRetryDelaySeconds(999)).toBe(480);
    expect(marketWatchRetryDelaySeconds(0)).toBe(30);
  });

  it("pauses a watch after repeated failures and allows explicit recovery", () => {
    expect(marketWatchStatusAfterFailure(1)).toBe("active");
    expect(marketWatchStatusAfterFailure(MAX_MARKET_WATCH_FAILURES - 1)).toBe("active");
    expect(marketWatchStatusAfterFailure(MAX_MARKET_WATCH_FAILURES)).toBe("failed");
  });
});
