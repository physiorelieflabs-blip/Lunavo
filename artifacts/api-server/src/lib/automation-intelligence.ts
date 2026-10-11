import { recommendDynamicPrice } from "./dynamic-pricing";

export type OpportunityEvidence = {
  demand: number;
  competition: number;
  profit: number;
  growth: number;
  supplier: number;
  marketFit: number;
  risk: number;
};

export type PriceInputs = {
  supplierCostMinor: number;
  shippingMinor?: number;
  taxMinor?: number;
  feeMinor?: number;
  marketLowMinor?: number;
  marketHighMinor?: number;
  demandScore?: number;
  competitionScore?: number;
  minimumMarginPercent: number;
  maxPriceMultiplier?: number;
};

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));

export function scoreOpportunity(e: OpportunityEvidence) {
  const score = Math.round(clamp(e.demand) * 0.25 + (100 - clamp(e.competition)) * 0.20 + clamp(e.profit) * 0.20 + clamp(e.growth) * 0.10 + clamp(e.supplier) * 0.10 + clamp(e.marketFit) * 0.10 + (100 - clamp(e.risk)) * 0.05);
  return { score, label: score >= 80 ? "excellent" : score >= 65 ? "strong" : score >= 45 ? "watch" : "avoid" } as const;
}

/** Legacy result shape backed by the canonical deterministic pricing engine. */
export function recommendPrice(input: PriceInputs) {
  const supplierCost = input.supplierCostMinor;
  if (!Number.isSafeInteger(supplierCost) || supplierCost <= 0) throw new Error("Supplier cost must be a positive safe integer");
  for (const [label, value] of [
    ["Shipping", input.shippingMinor],
    ["Tax", input.taxMinor],
    ["Fee", input.feeMinor],
  ] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error(label + " must be a non-negative integer in minor units");
    }
  }
  if (!Number.isFinite(input.minimumMarginPercent) || input.minimumMarginPercent < 0 || input.minimumMarginPercent >= 100) {
    throw new Error("Minimum margin must be between 0 and 100 percent");
  }
  let maxPriceMinor: number | undefined;
  if (input.maxPriceMultiplier !== undefined) {
    if (!Number.isFinite(input.maxPriceMultiplier) || input.maxPriceMultiplier <= 0) {
      throw new Error("Maximum price multiplier must be positive");
    }
    const cap = Math.floor(supplierCost * input.maxPriceMultiplier);
    if (!Number.isSafeInteger(cap) || cap <= 0) throw new Error("Maximum price cap exceeds the safe monetary range");
    maxPriceMinor = cap;
  }

  const overhead = (input.shippingMinor ?? 0) + (input.taxMinor ?? 0) + (input.feeMinor ?? 0);
  const landedCostMinor = supplierCost + overhead;
  if (!Number.isSafeInteger(landedCostMinor)) throw new Error("Landed cost exceeds the safe monetary range");
  const result = recommendDynamicPrice({
    supplierCostMinor: supplierCost,
    shippingMinor: input.shippingMinor,
    taxMinor: input.taxMinor,
    fixedFeesMinor: input.feeMinor,
    targetMarginPercent: input.minimumMarginPercent,
    marketLowMinor: input.marketLowMinor,
    marketHighMinor: input.marketHighMinor,
    demandScore: input.demandScore,
    competitionScore: input.competitionScore,
    maxPriceMinor,
  });
  return {
    landedCostMinor,
    minimumViablePriceMinor: result.floorPriceMinor,
    recommendedPriceMinor: result.recommendedPriceMinor,
    maximumCommercialPriceMinor: result.maximumCommercialPriceMinor,
    pricingStatus: result.pricingStatus,
  };
}
