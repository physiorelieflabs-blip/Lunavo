export type MarketWatchChangeInput = {
  previousPriceMinor: string | number | null | undefined;
  previousCurrency: string | null | undefined;
  previousAvailability: string | null | undefined;
  currentPriceMinor: number | null;
  currentCurrency: string | null;
  currentAvailability: string | null;
};

export type MarketWatchChangeSummary = {
  changed: boolean;
  priceChanged: boolean;
  availabilityChanged: boolean;
  previousPriceMinor: string | null;
  previousCurrency: string | null;
  previousAvailability: string | null;
  currentPriceMinor: string | null;
  currentCurrency: string | null;
  currentAvailability: string | null;
};

function priceToken(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const token = String(value);
  return /^\d+$/.test(token) ? token.replace(/^0+(?=\d)/, "") : null;
}

function normalizedAvailability(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized || null;
}

/**
 * Compare evidence, not commerce truth. Values are prices exposed by public page
 * metadata and are never interpreted as verified checkout quotes.
 */
export function summarizeMarketWatchChange(input: MarketWatchChangeInput): MarketWatchChangeSummary {
  const previousPriceMinor = priceToken(input.previousPriceMinor);
  const currentPriceMinor = priceToken(input.currentPriceMinor);
  const previousCurrency = input.previousCurrency ?? null;
  const currentCurrency = input.currentCurrency ?? null;
  const previousAvailability = normalizedAvailability(input.previousAvailability);
  const currentAvailability = normalizedAvailability(input.currentAvailability);

  const hasObservedPrice = previousPriceMinor !== null || currentPriceMinor !== null;
  const priceChanged = previousPriceMinor !== currentPriceMinor ||
    (hasObservedPrice && previousCurrency !== currentCurrency);
  const availabilityChanged = previousAvailability !== currentAvailability &&
    (previousAvailability !== null || currentAvailability !== null);

  return {
    changed: priceChanged || availabilityChanged,
    priceChanged,
    availabilityChanged,
    previousPriceMinor,
    previousCurrency,
    previousAvailability,
    currentPriceMinor,
    currentCurrency,
    currentAvailability,
  };
}
