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

export type PricingResult = {
  recommendedPriceMinor: number;
  maximumCommercialPriceMinor: number;
  floorPriceMinor: number;
  marketReferenceMinor: number | null;
};

const finite = (v: number | undefined, fallback = 0) => Number.isFinite(v) ? Number(v) : fallback;
const nonNegative = (v: number | undefined) => Math.max(0, finite(v));

/** Computes a defensible price from actual cost/market inputs; no arbitrary hardcoded selling price. */
export function recommendDynamicPrice(input: PricingInputs): PricingResult {
  if (!Number.isSafeInteger(input.supplierCostMinor) || input.supplierCostMinor < 0) throw new Error("Invalid supplier cost");
  if (!Number.isFinite(input.targetMarginPercent) || input.targetMarginPercent < 0 || input.targetMarginPercent >= 100) throw new Error("Invalid target margin");

  const baseCost = input.supplierCostMinor + nonNegative(input.shippingMinor) + nonNegative(input.taxMinor) + nonNegative(input.fixedFeesMinor);
  const feeRate = Math.max(0, finite(input.percentageFeeBps)) / 10000;
  const denominator = 1 - feeRate - input.targetMarginPercent / 100;
  if (denominator <= 0) throw new Error("Target margin is incompatible with percentage fees");

  const marginPrice = Math.ceil(baseCost / denominator);
  const low = Number.isSafeInteger(input.marketLowMinor) && input.marketLowMinor! > 0 ? input.marketLowMinor! : null;
  const high = Number.isSafeInteger(input.marketHighMinor) && input.marketHighMinor! > 0 ? input.marketHighMinor! : null;
  const marketReference = low !== null && high !== null ? Math.round((low + high) / 2) : (low ?? high);

  const demand = Math.max(0, Math.min(100, finite(input.demandScore, 50)));
  const competition = Math.max(0, Math.min(100, finite(input.competitionScore, 50)));
  let recommended = marketReference === null ? marginPrice : Math.max(marginPrice, Math.round(marketReference * (1 + (demand - competition) / 1000)));

  const floor = Math.max(marginPrice, nonNegative(input.minPriceMinor));
  const maximum = Math.max(floor, Number.isSafeInteger(input.maxPriceMinor) && input.maxPriceMinor! > 0 ? input.maxPriceMinor! : (marketReference ? Math.max(marketReference, marginPrice) : marginPrice));
  recommended = Math.min(Math.max(recommended, floor), maximum);
  return { recommendedPriceMinor: recommended, maximumCommercialPriceMinor: maximum, floorPriceMinor: floor, marketReferenceMinor: marketReference };
}
