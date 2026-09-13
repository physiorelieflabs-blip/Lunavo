export const STORE_AUCTION_MIN_VERIFIED_PROFIT_USD = 500_000;
export const DEFAULT_DAILY_AI_ADS = 0;

export type ProductOpportunity = {
  demandScore: number;
  competitionScore: number;
  marginScore: number;
  supplierScore: number;
  growthScore: number;
  riskScore: number;
};

export type OpportunityLabel = "excellent" | "strong" | "watch" | "avoid";

/** Product opportunity prioritisation. Higher competition reduces the score. */
export function scoreProductOpportunity(input: ProductOpportunity): { total: number; label: OpportunityLabel } {
  const demand = clamp(input.demandScore);
  const lowCompetition = 100 - clamp(input.competitionScore);
  const margin = clamp(input.marginScore);
  const supplier = clamp(input.supplierScore);
  const growth = clamp(input.growthScore);
  const risk = clamp(input.riskScore);
  const total = Number((demand * 0.30 + lowCompetition * 0.25 + margin * 0.18 + supplier * 0.12 + growth * 0.10 + risk * 0.05).toFixed(2));
  return { total, label: total >= 80 ? "excellent" : total >= 65 ? "strong" : total >= 45 ? "watch" : "avoid" };
}

/**
 * Calculates a commercially sensible price ceiling from authoritative cost and
 * observed market inputs. Missing evidence deliberately produces null.
 */
export function calculatePriceCeiling(input: {
  landedCostMinor: number;
  marketLowMinor: number | null;
  marketHighMinor: number | null;
  targetMarginPercent: number;
}): number | null {
  if (![input.landedCostMinor, input.targetMarginPercent].every(Number.isFinite)) return null;
  if (input.landedCostMinor <= 0 || input.marketLowMinor == null || input.marketHighMinor == null) return null;
  if (!Number.isFinite(input.marketLowMinor) || !Number.isFinite(input.marketHighMinor) || input.marketLowMinor <= 0 || input.marketHighMinor < input.marketLowMinor) return null;
  const marginRate = Math.min(Math.max(input.targetMarginPercent / 100, 0), 0.95);
  const marginCeiling = input.landedCostMinor / (1 - marginRate);
  return Math.round(Math.min(input.marketHighMinor, Math.max(input.marketLowMinor, marginCeiling)));
}

export function canMerchantAuctionStore(verifiedProfitUsd: number, isAdminCreatedStore = false): boolean {
  return isAdminCreatedStore || (Number.isFinite(verifiedProfitUsd) && verifiedProfitUsd >= STORE_AUCTION_MIN_VERIFIED_PROFIT_USD);
}

export function normalizeDailyAdCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DAILY_AI_ADS;
  return Math.max(0, Math.min(10_000, Math.floor(value)));
}

function clamp(value: number): number { return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)); }
