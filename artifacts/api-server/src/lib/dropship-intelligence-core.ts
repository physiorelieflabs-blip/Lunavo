export type ProductDecision = "SCALE" | "TEST" | "FIX" | "PAUSE";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export type ProductEconomicsInput = {
  sellingPriceMinor: number;
  supplierCostMinor: number | null;
  shippingCostMinor: number | null;
  adSpendPerOrderMinor?: number | null;
  targetMarginBps?: number;
  supplierQualityScore?: number | null;
  supplierTrackingScore?: number | null;
  etaMaxDays?: number | null;
  stockQuantity?: number | null;
  stockStatus?: string | null;
  providerFeeMinor?: number | null;
  refundRateBps?: number | null;
};

export type ProductEconomics = {
  decision: ProductDecision;
  risk: RiskLevel;
  revenueMinor: number;
  landedCostMinor: number | null;
  platformFeeMinor: number;
  providerFeeMinor: number | null;
  contributionBeforeAdsMinor: number | null;
  contributionAfterAdsMinor: number | null;
  marginBpsBeforeAds: number | null;
  breakEvenCpaMinor: number | null;
  breakEvenRoasX100: number | null;
  viabilityScore: number;
  reasons: string[];
};

function finiteMinor(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  const minor = Math.round(value);
  return Number.isSafeInteger(minor) ? minor : null;
}

function finiteScore(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value));
}

export function scoreSupplier(
  input: {
    qualityScore?: number | null;
    trackingScore?: number | null;
    lateRateBps?: number | null;
    defectRateBps?: number | null;
    observations: number;
    fulfilledOrders: number;
  },
) {
  const quality = finiteScore(input.qualityScore);
  const tracking = finiteScore(input.trackingScore);
  const latePenalty = input.lateRateBps == null ? 0 : Math.min(35, Math.max(0, input.lateRateBps / 100));
  const defectPenalty = input.defectRateBps == null ? 0 : Math.min(35, Math.max(0, input.defectRateBps / 100));
  const evidence = Math.min(20, Math.log10(Math.max(1, input.observations + input.fulfilledOrders)) * 10);
  const base = ((quality ?? 60) * 0.45) + ((tracking ?? 60) * 0.35) + evidence - latePenalty - defectPenalty;
  const score = Math.round(Math.min(100, Math.max(0, base)));
  const confidence = input.fulfilledOrders + input.observations >= 20 ? "high" : input.fulfilledOrders + input.observations >= 5 ? "medium" : "low";
  return { score, confidence };
}

export function productEconomics(input: ProductEconomicsInput): ProductEconomics {
  const revenue = finiteMinor(input.sellingPriceMinor);
  if (revenue === null || revenue <= 0) throw new Error("Selling price must be a positive integer number of minor units");
  const supplierCost = finiteMinor(input.supplierCostMinor);
  const shippingCost = finiteMinor(input.shippingCostMinor);
  const providerFee = finiteMinor(input.providerFeeMinor);
  const adSpend = finiteMinor(input.adSpendPerOrderMinor);
  const platformFee = Math.round(revenue * 0.01);
  const landed = supplierCost === null || shippingCost === null ? null : supplierCost + shippingCost;
  const beforeAds = landed === null ? null : revenue - landed - platformFee - (providerFee ?? 0);
  const afterAds = beforeAds === null ? null : beforeAds - (adSpend ?? 0);
  const marginBps = beforeAds === null ? null : Math.round((beforeAds / revenue) * 10_000);
  const breakEvenCpa = beforeAds === null ? null : Math.max(0, beforeAds);
  const breakEvenRoas = breakEvenCpa && breakEvenCpa > 0 ? Math.round((revenue / breakEvenCpa) * 100) : null;

  let score = 100;
  const reasons: string[] = [];
  if (landed === null) { score -= 25; reasons.push("Record both supplier cost and shipping cost before trusting profitability."); }
  if (beforeAds !== null && beforeAds <= 0) { score -= 60; reasons.push("The product has no positive contribution before advertising."); }
  const target = Math.min(9_000, Math.max(0, Math.round(input.targetMarginBps ?? 2_000)));
  if (marginBps !== null && marginBps < target) { score -= Math.min(25, Math.ceil((target - marginBps) / 200)); reasons.push("Contribution margin is below your target."); }
  const quality = finiteScore(input.supplierQualityScore);
  const tracking = finiteScore(input.supplierTrackingScore);
  if (quality !== null && quality < 60) { score -= 15; reasons.push("Recorded supplier quality evidence is weak."); }
  if (tracking !== null && tracking < 60) { score -= 15; reasons.push("Recorded supplier tracking reliability is weak."); }
  if (input.etaMaxDays != null && input.etaMaxDays > 21) { score -= 12; reasons.push("Recorded maximum delivery time is long enough to raise customer-support and dispute risk."); }
  if (input.refundRateBps != null && input.refundRateBps > 800) { score -= 12; reasons.push("Observed refund rate is elevated."); }
  if (typeof input.stockQuantity === "number" && input.stockQuantity <= 0) { score -= 40; reasons.push("Recorded supplier stock is zero."); }
  if (input.stockStatus === "out_of_stock") { score -= 40; reasons.push("Supplier has recorded this product as out of stock."); }
  if (adSpend !== null && breakEvenCpa !== null && adSpend > breakEvenCpa) { score -= 30; reasons.push("Current ad spend per order is above the break-even CPA."); }

  const viabilityScore = Math.min(100, Math.max(0, score));
  let decision: ProductDecision = "TEST";
  if (input.stockStatus === "out_of_stock" || (beforeAds !== null && beforeAds <= 0)) decision = "PAUSE";
  else if (viabilityScore >= 82 && (tracking ?? 70) >= 70 && (quality ?? 70) >= 70) decision = "SCALE";
  else if (viabilityScore < 55 || (adSpend !== null && breakEvenCpa !== null && adSpend > breakEvenCpa)) decision = "FIX";
  const risk: RiskLevel = viabilityScore < 45 ? "critical" : viabilityScore < 60 ? "high" : viabilityScore < 80 ? "medium" : "low";
  if (!reasons.length) reasons.push("No recorded red flags were found in the available evidence.");
  return {
    decision,
    risk,
    revenueMinor: revenue,
    landedCostMinor: landed,
    platformFeeMinor: platformFee,
    providerFeeMinor: providerFee,
    contributionBeforeAdsMinor: beforeAds,
    contributionAfterAdsMinor: afterAds,
    marginBpsBeforeAds: marginBps,
    breakEvenCpaMinor: breakEvenCpa,
    breakEvenRoasX100: breakEvenRoas,
    viabilityScore,
    reasons: reasons.slice(0, 8),
  };
}

export function trackingGap(input: { status: string; lastRecordedAt: string | Date | null; now?: Date; warningHours?: number; criticalHours?: number }) {
  const last = input.lastRecordedAt ? new Date(input.lastRecordedAt).getTime() : NaN;
  if (!Number.isFinite(last) || !["shipped", "in_transit"].includes(input.status)) return { state: "unknown" as const, gapHours: null, message: "No active tracking gap can be established from recorded events." };
  const hours = Math.max(0, ((input.now?.getTime() ?? Date.now()) - last) / 3_600_000);
  const critical = input.criticalHours ?? 120;
  const warning = input.warningHours ?? 72;
  const state = hours >= critical ? "critical" as const : hours >= warning ? "warning" as const : "healthy" as const;
  return { state, gapHours: Math.round(hours), message: state === "critical" ? "Tracking has gone silent for a critical interval." : state === "warning" ? "Tracking has gone silent longer than the warning interval." : "Recorded tracking activity is within the normal observation window." };
}
