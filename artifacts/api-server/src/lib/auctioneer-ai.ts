export type AuctioneerStrategy = "maximize_value" | "balanced" | "fast_sale";

export type AuctionBidSignal = {
  amount: number;
  createdAt: Date | string;
  bidderKey?: string;
};

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
  bidHistory?: AuctionBidSignal[];
};

/**
 * Produces a state-aware auction plan from observed bidding behaviour.
 * It may recommend pricing, promotion and truthful timing tactics, but never
 * manufactures competition or places bids for the seller.
 */
export function buildAuctioneerStrategy(input: AuctioneerInputs, strategy: AuctioneerStrategy) {
  const ask = positive(input.askingPrice);
  const current = Math.max(0, input.currentBid);
  const target = positiveOrNull(input.targetPrice);
  const floor = positiveOrNull(input.minimumAcceptablePrice);
  const velocity = Math.max(0, input.historicalBidVelocity);
  const hours = Math.max(0, input.hoursRemaining);
  const traffic = Math.max(0, input.traffic ?? 0);
  const conversion = clamp(input.conversionRate ?? 0, 0, 1);
  const history = [...(input.bidHistory ?? [])]
    .filter(b => Number.isFinite(b.amount) && b.amount > 0)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const bidCount = Math.max(input.bidCount, history.length);
  const last = history.at(-1)?.amount ?? current;
  const previous = history.at(-2)?.amount ?? null;
  const lastIncrement = previous == null ? null : Math.max(0, last - previous);
  const first = history[0]?.amount ?? ask;
  const priceLift = Math.max(0, current - ask) / ask;
  const recentWindowMs = 60 * 60 * 1000;
  const now = Date.now();
  const recentBids = history.filter(b => now - new Date(b.createdAt).getTime() <= recentWindowMs).length;
  const recentVelocity = recentBids / Math.max(1, Math.min(1, hours === 0 ? 1 : 1));
  const acceleration = velocity > 0 ? recentVelocity / velocity : recentBids > 0 ? 2 : 0;
  const uniqueBidders = new Set(history.map(b => b.bidderKey).filter(Boolean)).size;
  const bidderDiversity = uniqueBidders > 0 ? uniqueBidders / Math.max(1, bidCount) : 0;

  const demandSignal = clamp(
    bidCount * 7 + velocity * 18 + traffic / 100 + conversion * 40 + priceLift * 35 + uniqueBidders * 5,
    0, 100,
  );
  const momentumSignal = clamp(
    35 + Math.min(40, recentBids * 10) + Math.min(25, Math.max(0, acceleration - 1) * 25),
    0, 100,
  );
  const urgencySignal = hours <= 2 ? 100 : hours <= 6 ? 90 : hours <= 24 ? 70 : hours <= 72 ? 40 : 15;
  const stallSignal = bidCount === 0 ? 100 : hours > 0 && recentBids === 0 ? 80 : lastIncrement === 0 ? 70 : 10;
  const competitiveSignal = clamp(uniqueBidders * 14 + bidderDiversity * 35 + Math.min(30, bidCount * 2), 0, 100);

  // The recommended increment responds to actual bid spacing and momentum instead
  // of applying a single hard-coded percentage to every auction.
  const baselineIncrement = Math.max(ask * 0.005, current * 0.005, 0.01);
  const observedIncrement = lastIncrement && lastIncrement > 0 ? lastIncrement : baselineIncrement;
  const momentumMultiplier = momentumSignal >= 75 ? 1.2 : momentumSignal >= 50 ? 1.05 : 0.9;
  const recommendedIncrement = roundMoney(Math.max(0.01, observedIncrement * momentumMultiplier));

  const strategyMultiplier = strategy === "maximize_value" ? 1.15 : strategy === "balanced" ? 1.08 : 1.03;
  const momentumUplift = momentumSignal >= 75 ? 0.05 : momentumSignal >= 50 ? 0.025 : 0;
  const competitionUplift = competitiveSignal >= 65 ? 0.035 : 0;
  const targetBid = target ?? roundMoney(Math.max(ask, current) * (strategyMultiplier + momentumUplift + competitionUplift));

  let posture: "build_interest" | "hold_value" | "capitalize_momentum" | "protect_floor" | "close_strong";
  let nextMove: string;
  if (hours <= 2 && momentumSignal >= 65 && competitiveSignal >= 45) {
    posture = "close_strong";
    nextMove = "Keep the auction open through its scheduled close and concentrate truthful buyer-facing promotion now; bidding momentum is strong.";
  } else if (momentumSignal >= 75 && competitiveSignal >= 55) {
    posture = "capitalize_momentum";
    nextMove = "Capitalize on genuine bidding momentum with value-focused promotion and avoid unnecessary price concessions.";
  } else if (stallSignal >= 70 && hours > 6) {
    posture = "build_interest";
    nextMove = "The auction is stalling. Improve verified listing value, widen authorized exposure and monitor for renewed bidding before changing price.";
  } else if (floor != null && current < floor) {
    posture = "protect_floor";
    nextMove = "Current bidding is below the seller floor. Do not lower the floor automatically; increase qualified exposure instead.";
  } else {
    posture = "hold_value";
    nextMove = "Maintain value positioning and monitor bid spacing, bidder diversity and momentum before making the next adjustment.";
  }

  const actions = [
    nextMove,
    `Use an adaptive next-bid increment around ${recommendedIncrement.toFixed(2)} ${input.currency}, based on observed bid spacing and momentum.`,
    momentumSignal >= 65 ? "Prioritize the strongest verified value points while bidding is active." : "Refresh the listing presentation and target qualified buyers through authorized channels.",
    hours <= 6 ? "Use truthful closing-time reminders; never claim that other buyers are bidding unless that activity is actually recorded." : "Do not manufacture urgency; let genuine demand signals drive the strategy.",
    strategy === "maximize_value" ? "Protect the seller's economic value and avoid unnecessary discounts." : strategy === "balanced" ? "Balance conversion probability with price preservation." : "Prioritize qualified exposure and reduce buyer friction without inventing incentives.",
  ];

  return {
    strategy,
    posture,
    recommendedNextBid: roundMoney(Math.max(current + recommendedIncrement, ask + recommendedIncrement)),
    recommendedBidIncrement: recommendedIncrement,
    targetBid,
    demandSignal: round(demandSignal),
    momentumSignal: round(momentumSignal),
    competitiveSignal: round(competitiveSignal),
    urgencySignal,
    stallSignal,
    bidAnalysis: {
      bidCount,
      uniqueBidders,
      latestBid: round(last),
      previousBid: previous == null ? null : round(previous),
      latestIncrement: lastIncrement == null ? null : round(lastIncrement),
      recentBidsLastHour: recentBids,
      acceleration: round(acceleration),
      priceLiftFromAsk: round(priceLift * 100),
    },
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
