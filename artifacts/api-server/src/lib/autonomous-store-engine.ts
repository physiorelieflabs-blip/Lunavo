import { calculatePriceCeiling, scoreProductOpportunity } from "./autonomous-store-policy";

export type ProductOpportunityInput = {
  externalKey: string;
  productName: string;
  currency: string;
  landedCostMinor: number;
  marketLowMinor: number | null;
  marketHighMinor: number | null;
  demand: number;
  lowCompetition: number;
  growth: number;
  supplier: number;
  marketFit: number;
  risk: number;
};

export type AutonomousOpportunity = ProductOpportunityInput & {
  recommendedPriceMinor: number | null;
  maximumCommercialPriceMinor: number | null;
  totalScore: number;
  label: "excellent" | "strong" | "watch" | "avoid";
};

/**
 * Converts only supplied market/supplier evidence into a store opportunity.
 * No market facts are invented here; missing price evidence keeps pricing
 * unavailable instead of manufacturing a ceiling.
 */
export function buildAutonomousOpportunity(input: ProductOpportunityInput): AutonomousOpportunity {
  const score = scoreProductOpportunity({
    demand: input.demand,
    lowCompetition: input.lowCompetition,
    margin: input.marketHighMinor != null && input.landedCostMinor > 0
      ? Math.max(0, Math.min(100, ((input.marketHighMinor - input.landedCostMinor) / input.landedCostMinor) * 100))
      : 0,
    supplier: input.supplier,
    growth: input.growth,
    risk: input.risk,
  });

  const maximumCommercialPriceMinor = calculatePriceCeiling({
    landedCostMinor: input.landedCostMinor,
    marketLowMinor: input.marketLowMinor,
    marketHighMinor: input.marketHighMinor,
    targetMarginPercent: 30,
  });

  const recommendedPriceMinor = maximumCommercialPriceMinor == null
    ? null
    : Math.max(
        input.landedCostMinor,
        Math.min(
          maximumCommercialPriceMinor,
          input.marketLowMinor == null
            ? maximumCommercialPriceMinor
            : Math.round((input.marketLowMinor + maximumCommercialPriceMinor) / 2),
        ),
      );

  return {
    ...input,
    recommendedPriceMinor,
    maximumCommercialPriceMinor,
    totalScore: score.total,
    label: score.label,
  };
}

export function rankAutonomousOpportunities(items: AutonomousOpportunity[]) {
  return [...items].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if ((b.demand - b.risk) !== (a.demand - a.risk)) return (b.demand - b.risk) - (a.demand - a.risk);
    return a.productName.localeCompare(b.productName);
  });
}

/** Distributes a merchant's configured daily ad count across the day. */
export function buildDailyAdSlots(dailyCount: number, startHour = 8, endHour = 22) {
  const count = Math.max(0, Math.min(100, Math.trunc(dailyCount)));
  if (count === 0) return [] as Date[];
  const start = Math.max(0, Math.min(23, Math.trunc(startHour)));
  const end = Math.max(start + 1, Math.min(24, Math.trunc(endHour)));
  const spanMinutes = (end - start) * 60;
  return Array.from({ length: count }, (_, index) => {
    const minute = Math.floor(((index + 0.5) * spanMinutes) / count);
    const slot = new Date();
    slot.setHours(start, 0, 0, 0);
    slot.setMinutes(minute);
    return slot;
  });
}
