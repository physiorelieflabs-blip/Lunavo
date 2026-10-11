export type PricingInputs = {
  supplierCostMinor: number;
  shippingMinor?: number;
  taxMinor?: number;
  fixedFeesMinor?: number;
  percentageFeeBps?: number;
  targetMarginPercent: number;
  marketLowMinor?: number;
  marketHighMinor?: number;
  demandScore?: number;
  competitionScore?: number;
  minPriceMinor?: number;
  maxPriceMinor?: number;
};
export type PricingStatus = "evidence_backed" | "insufficient_market_evidence" | "incompatible_price_limits" | "market_below_floor";
export type PricingResult = {
  recommendedPriceMinor: number | null;
  maximumCommercialPriceMinor: number | null;
  floorPriceMinor: number;
  marketReferenceMinor: number | null;
  pricingStatus: PricingStatus;
};
function optionalNonNegativeMinor(value: number | undefined, label: string): number {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(label + " must be a non-negative safe integer in minor units");
  return value;
}
function optionalPositiveMinor(value: number | undefined, label: string): number | null {
  if (value === undefined) return null;
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(label + " must be a positive safe integer in minor units");
  return value;
}
function boundedScore(value: number | undefined, fallback = 50): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}
/**
 * All money values are integer minor units. Missing evidence never becomes a fabricated price.
 * An incompatible cap or market range returns no recommendation instead of breaching the margin floor.
 */
export function recommendDynamicPrice(input: PricingInputs): PricingResult {
  if (!Number.isSafeInteger(input.supplierCostMinor) || input.supplierCostMinor <= 0) throw new Error("Invalid supplier cost");
  if (!Number.isFinite(input.targetMarginPercent) || input.targetMarginPercent < 0 || input.targetMarginPercent >= 100) throw new Error("Invalid target margin");
  const shipping = optionalNonNegativeMinor(input.shippingMinor, "Shipping");
  const tax = optionalNonNegativeMinor(input.taxMinor, "Tax");
  const fixedFees = optionalNonNegativeMinor(input.fixedFeesMinor, "Fixed fees");
  const feeBps = input.percentageFeeBps ?? 0;
  if (!Number.isFinite(feeBps) || feeBps < 0 || feeBps >= 10_000) throw new Error("Percentage fees must be between 0 and 9999 basis points");
  const minPrice = optionalNonNegativeMinor(input.minPriceMinor, "Minimum price");
  const maxPrice = optionalPositiveMinor(input.maxPriceMinor, "Maximum price");
  const marketLow = optionalPositiveMinor(input.marketLowMinor, "Market low");
  const marketHigh = optionalPositiveMinor(input.marketHighMinor, "Market high");
  const baseCost = input.supplierCostMinor + shipping + tax + fixedFees;
  if (!Number.isSafeInteger(baseCost)) throw new Error("Total landed cost exceeds the safe monetary range");
  const denominator = 1 - feeBps / 10_000 - input.targetMarginPercent / 100;
  if (denominator <= 0) throw new Error("Target margin is incompatible with percentage fees");
  const computedFloor = Math.ceil(baseCost / denominator);
  if (!Number.isSafeInteger(computedFloor)) throw new Error("Minimum viable price exceeds the safe monetary range");
  const floor = Math.max(computedFloor, minPrice ?? 0);
  const reference = marketLow !== null && marketHigh !== null && marketHigh >= marketLow
    ? Math.round((marketLow + marketHigh) / 2)
    : marketLow ?? marketHigh;
  if (maxPrice !== null && maxPrice < floor) {
    return { recommendedPriceMinor: null, maximumCommercialPriceMinor: maxPrice, floorPriceMinor: floor, marketReferenceMinor: reference, pricingStatus: "incompatible_price_limits" };
  }
  if (marketLow === null || marketHigh === null || marketHigh < marketLow) {
    return { recommendedPriceMinor: null, maximumCommercialPriceMinor: maxPrice, floorPriceMinor: floor, marketReferenceMinor: reference, pricingStatus: "insufficient_market_evidence" };
  }
  const ceiling = maxPrice === null ? marketHigh : Math.min(marketHigh, maxPrice);
  if (ceiling < floor) {
    return { recommendedPriceMinor: null, maximumCommercialPriceMinor: ceiling, floorPriceMinor: floor, marketReferenceMinor: reference, pricingStatus: "market_below_floor" };
  }
  const marketReference = Math.round((marketLow + marketHigh) / 2);
  const demand = boundedScore(input.demandScore);
  const competition = boundedScore(input.competitionScore);
  const recommended = Math.min(ceiling, Math.max(floor, Math.round(marketReference * (1 + (demand - competition) / 1000))));
  return { recommendedPriceMinor: recommended, maximumCommercialPriceMinor: ceiling, floorPriceMinor: floor, marketReferenceMinor: marketReference, pricingStatus: "evidence_backed" };
}
