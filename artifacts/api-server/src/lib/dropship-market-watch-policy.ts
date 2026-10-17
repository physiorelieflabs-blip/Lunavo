export const MIN_MARKET_WATCH_INTERVAL_MINUTES = 60;
export const MAX_MARKET_WATCH_INTERVAL_MINUTES = 24 * 60;
export const MAX_MARKET_WATCHES_PER_MERCHANT = 30;
export const MAX_MARKET_WATCH_FAILURES = 5;

export function isValidMarketWatchInterval(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_MARKET_WATCH_INTERVAL_MINUTES &&
    value <= MAX_MARKET_WATCH_INTERVAL_MINUTES;
}

export function marketWatchRetryDelaySeconds(failureCount: number): number {
  const attempt = Number.isInteger(failureCount) ? Math.max(1, Math.min(failureCount, MAX_MARKET_WATCH_FAILURES)) : 1;
  return Math.min(30 * (2 ** (attempt - 1)), 15 * 60);
}

export function marketWatchStatusAfterFailure(failureCount: number): "active" | "failed" {
  return failureCount >= MAX_MARKET_WATCH_FAILURES ? "failed" : "active";
}
