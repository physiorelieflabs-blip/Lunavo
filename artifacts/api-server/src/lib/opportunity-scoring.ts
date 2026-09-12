export type OpportunityEvidence = {
  demand: number;
  competition: number;
  growth?: number;
  profit: number;
  supplier: number;
  marketFit: number;
  risk: number;
};

export type OpportunityScore = OpportunityEvidence & {
  total: number;
  label: "excellent" | "strong" | "watch" | "avoid";
};

const clamp = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

/**
 * Scores only supplied evidence. It deliberately does not invent demand, competition,
 * supplier quality, or market data when a provider has not supplied it.
 */
export function scoreProductOpportunity(evidence: OpportunityEvidence): OpportunityScore {
  const demand = clamp(evidence.demand);
  const competition = clamp(evidence.competition);
  const growth = clamp(evidence.growth ?? 0);
  const profit = clamp(evidence.profit);
  const supplier = clamp(evidence.supplier);
  const marketFit = clamp(evidence.marketFit);
  const risk = clamp(evidence.risk);

  const total = Number((
    demand * 0.25 +
    competition * 0.15 +
    growth * 0.10 +
    profit * 0.20 +
    supplier * 0.10 +
    marketFit * 0.15 -
    risk * 0.05
  ).toFixed(2));

  const label = total >= 80 ? "excellent" : total >= 65 ? "strong" : total >= 45 ? "watch" : "avoid";
  return { demand, competition, growth, profit, supplier, marketFit, risk, total, label };
}
