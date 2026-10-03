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

/** Legacy compatibility wrapper. Pricing is now evidence-only: no fabricated
 * market-high fallback or arbitrary multiplier is permitted. */
export function recommendPrice(input: PriceInputs) {
  const cost = Math.max(0, Math.trunc(input.supplierCostMinor));
  if (cost <= 0) throw new Error("Supplier cost must be positive");
  const overhead = Math.max(0, Math.trunc(input.shippingMinor ?? 0)) + Math.max(0, Math.trunc(input.taxMinor ?? 0)) + Math.max(0, Math.trunc(input.feeMinor ?? 0));
  const landed = cost + overhead;
  const margin = clamp(input.minimumMarginPercent, 0, 95);
  const floor = Math.ceil(landed / Math.max(0.01, 1 - margin / 100));
  const marketLow = input.marketLowMinor && input.marketLowMinor > 0 ? Math.trunc(input.marketLowMinor) : null;
  const marketHigh = input.marketHighMinor && input.marketHighMinor >= (marketLow ?? 0) ? Math.trunc(input.marketHighMinor) : null;
  if (marketLow == null || marketHigh == null) {
    return { landedCostMinor: landed, minimumViablePriceMinor: floor, recommendedPriceMinor: null, maximumCommercialPriceMinor: null, pricingStatus: "insufficient_market_evidence" as const };
  }
  const demand = clamp(input.demandScore ?? 50);
  const competition = clamp(input.competitionScore ?? 50);
  const marketTarget = marketLow + Math.round((marketHigh - marketLow) * (0.35 + demand / 400 + (100 - competition) / 500));
  const recommended = Math.max(floor, Math.min(marketHigh, marketTarget));
  return { landedCostMinor: landed, minimumViablePriceMinor: floor, recommendedPriceMinor: recommended, maximumCommercialPriceMinor: marketHigh, pricingStatus: "evidence_backed" as const };
}
