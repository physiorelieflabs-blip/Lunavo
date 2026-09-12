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

/**
 * Product opportunity prioritisation: demand and low competition are primary
 * signals, while margin, supplier quality, growth and risk protect against
 * choosing a merely popular but commercially poor product.
 */
export function scoreProductOpportunity(input: ProductOpportunity): number {
  const demand = clamp(input.demandScore);
  const lowCompetition = 100 - clamp(input.competitionScore);
  const margin = clamp(input.marginScore);
  const supplier = clamp(input.supplierScore);
  const growth = clamp(input.growthScore);
  const risk = clamp(input.riskScore);
  return Number((demand * 0.30 + lowCompetition * 0.25 + margin * 0.18 + supplier * 0.12 + growth * 0.10 + risk * 0.05).toFixed(2));
}

/**
 * Calculates a commercially sensible price ceiling from real market and cost
 * inputs. It intentionally refuses to invent a price when authoritative cost
 * or market data is unavailable.
 */
export function calculatePriceCeiling(input: {
  landedCost: number;
  marketLow: number;
  marketHigh: number;
  targetMarginRate: number;
}): number | null {
  if (![input.landedCost, input.marketLow, input.marketHigh, input.targetMarginRate].every(Number.isFinite)) return null;
  if (input.landedCost <= 0 || input.marketLow <= 0 || input.marketHigh < input.marketLow) return null;
  const marginRate = Math.min(Math.max(input.targetMarginRate, 0), 0.95);
  const marginCeiling = input.landedCost / (1 - marginRate);
  return Number(Math.min(input.marketHigh, Math.max(input.marketLow, marginCeiling)).toFixed(2));
}

export function canMerchantAuctionStore(verifiedProfitUsd: number, isAdminCreatedStore = false): boolean {
  return isAdminCreatedStore || (Number.isFinite(verifiedProfitUsd) && verifiedProfitUsd >= STORE_AUCTION_MIN_VERIFIED_PROFIT_USD);
}

export function normalizeDailyAdCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DAILY_AI_ADS;
  return Math.max(0, Math.min(10_000, Math.floor(value)));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}
