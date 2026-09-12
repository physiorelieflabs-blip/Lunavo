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
  maxPriceMultiplier: number;
};

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

export function scoreOpportunity(e: OpportunityEvidence) {
  const weighted =
    e.demand * 0.25 +
    (100 - e.competition) * 0.20 +
    e.profit * 0.20 +
    e.growth * 0.10 +
    e.supplier * 0.10 +
    e.marketFit * 0.10 +
    (100 - e.risk) * 0.05;
  const score = Math.round(clamp(weighted));
  const label = score >= 80 ? "excellent" : score >= 65 ? "strong" : score >= 45 ? "watch" : "avoid";
  return { score, label } as const;
}

export function recommendPrice(input: PriceInputs) {
  const cost = Math.max(0, Math.trunc(input.supplierCostMinor));
  if (cost <= 0) throw new Error("Supplier cost must be positive");
  const overhead = Math.max(0, Math.trunc(input.shippingMinor ?? 0)) + Math.max(0, Math.trunc(input.taxMinor ?? 0)) + Math.max(0, Math.trunc(input.feeMinor ?? 0));
  const landed = cost + overhead;
  const margin = clamp(input.minimumMarginPercent, 0, 100);
  const floor = Math.ceil(landed / Math.max(0.01, 1 - margin / 100));
  const marketLow = input.marketLowMinor && input.marketLowMinor > 0 ? Math.trunc(input.marketLowMinor) : floor;
  const marketHigh = input.marketHighMinor && input.marketHighMinor >= marketLow ? Math.trunc(input.marketHighMinor) : Math.ceil(floor * 1.5);
  const demand = clamp(input.demandScore ?? 50);
  const competition = clamp(input.competitionScore ?? 50);
  const marketTarget = marketLow + Math.round((marketHigh - marketLow) * (0.35 + demand / 400 + (100 - competition) / 500));
  const recommended = Math.max(floor, marketTarget);
  const maximumCommercial = Math.max(recommended, Math.min(Math.ceil(cost * input.maxPriceMultiplier), marketHigh || Math.ceil(cost * input.maxPriceMultiplier)));
  return { landedCostMinor: landed, minimumViablePriceMinor: floor, recommendedPriceMinor: recommended, maximumCommercialPriceMinor: maximumCommercial };
}
