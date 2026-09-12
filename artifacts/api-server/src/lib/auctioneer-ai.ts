export type AuctioneerStrategy = "maximize_value" | "balanced" | "fast_sale";

export type AuctioneerInputs = {
  askingPrice: number;
  currency: string;
  currentBid: number;
  bidCount: number;
  hoursRemaining: number;
  historicalBidVelocity: number;
  targetPrice?: number | null;
  minimumAcceptablePrice?: number | null;
  traffic?: number;
  conversionRate?: number;
};

export function buildAuctioneerStrategy(input: AuctioneerInputs, strategy: AuctioneerStrategy) {
  const ask = positive(input.askingPrice);
  const current = Math.max(0, input.currentBid);
  const target = positiveOrNull(input.targetPrice);
  const floor = positiveOrNull(input.minimumAcceptablePrice);
  const velocity = Math.max(0, input.historicalBidVelocity);
  const hours = Math.max(0, input.hoursRemaining);
  const traffic = Math.max(0, input.traffic ?? 0);
  const conversion = clamp(input.conversionRate ?? 0, 0, 1);

  const demandSignal = Math.min(100, input.bidCount * 8 + velocity * 20 + traffic / 100 + conversion * 40);
  const urgencySignal = hours <= 6 ? 100 : hours <= 24 ? 70 : hours <= 72 ? 40 : 15;
  const recommendedIncrement = roundMoney(Math.max(0.01, Math.max(ask * (strategy === "maximize_value" ? 0.02 : 0.01), current * 0.01)));
  const targetBid = target ?? roundMoney(Math.max(ask, current) * (strategy === "maximize_value" ? 1.15 : strategy === "balanced" ? 1.08 : 1.03));

  const actions = strategy === "maximize_value"
    ? [
        "Use evidence-backed copy that highlights verified store performance and differentiators.",
        "Concentrate legitimate promotion around high-intent periods and the auction closing window.",
        "Keep the reserve/floor private; never create, simulate, or place fake bids.",
        "If bidding accelerates, preserve the auction rather than accepting an artificially low early exit.",
      ]
    : strategy === "balanced"
      ? [
          "Improve the listing copy and distribute it to authorized connected channels.",
          "Use a sensible bid increment and monitor bid velocity.",
          "Prefer a genuine competitive bid over aggressive artificial urgency.",
        ]
      : [
          "Prioritize qualified exposure and clear value communication.",
          "Reduce unnecessary friction for serious buyers near closing.",
          "Do not lower the seller floor automatically without explicit seller permission.",
        ];

  return {
    strategy,
    recommendedNextBid: roundMoney(Math.max(current + recommendedIncrement, ask + recommendedIncrement)),
    recommendedBidIncrement: recommendedIncrement,
    targetBid,
    demandSignal: round(demandSignal),
    urgencySignal,
    actions,
    guardrails: [
      "AI cannot bid on behalf of the seller.",
      "AI cannot create fake bidders, fake bids, fake demand, fake traffic, or fake performance.",
      "AI recommendations never bypass Lunavo payment, auction-integrity, or dashboard controls.",
      floor ? `Seller floor is ${floor.toFixed(2)} ${input.currency}.` : "No seller floor was supplied; AI will not invent one.",
    ],
  };
}

function positive(value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error("Auction price must be positive");
  return value;
}
function positiveOrNull(value?: number | null) {
  return value == null ? null : positive(value);
}
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)); }
function round(value: number) { return Number(value.toFixed(2)); }
function roundMoney(value: number) { return round(Math.max(0.01, value)); }
