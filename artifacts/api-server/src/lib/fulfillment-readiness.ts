export type FulfillmentReadiness = {
  eligible: boolean;
  status: "ready" | "failed";
  sourceCostAmount: number | null;
  sellingPriceAmount: number | null;
  marginPercent: number | null;
  minimumMarginPercent: number | null;
  reason: string | null;
};

function positiveMoney(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= Number.MAX_SAFE_INTEGER / 100 ? amount : null;
}

/** A missing/invalid cost or price is never treated as margin approval. */
export function evaluateFulfillmentReadiness(
  sourceCost: unknown,
  sellingPrice: unknown,
  minimumMargin: unknown,
): FulfillmentReadiness {
  const cost = positiveMoney(sourceCost);
  const selling = positiveMoney(sellingPrice);
  const minimum = typeof minimumMargin === "number" || typeof minimumMargin === "string"
    ? Number(minimumMargin)
    : Number.NaN;

  if (cost === null || selling === null) {
    return {
      eligible: false, status: "failed", sourceCostAmount: cost, sellingPriceAmount: selling,
      marginPercent: null, minimumMarginPercent: Number.isFinite(minimum) ? minimum : null,
      reason: "Automatic fulfillment is blocked because supplier cost or selling price is missing or invalid.",
    };
  }
  if (!Number.isFinite(minimum) || minimum < 0 || minimum > 100) {
    return {
      eligible: false, status: "failed", sourceCostAmount: cost, sellingPriceAmount: selling,
      marginPercent: Number(((selling - cost) / selling * 100).toFixed(4)),
      minimumMarginPercent: null,
      reason: "Automatic fulfillment is blocked because the configured minimum margin is invalid.",
    };
  }

  const marginPercent = Number(((selling - cost) / selling * 100).toFixed(4));
  if (!Number.isFinite(marginPercent) || marginPercent < minimum) {
    return {
      eligible: false, status: "failed", sourceCostAmount: cost, sellingPriceAmount: selling,
      marginPercent, minimumMarginPercent: minimum,
      reason: `Automatic fulfillment is blocked because the observed margin (${marginPercent}%) is below the configured minimum (${minimum}%). Review supplier cost and selling price before retrying.`,
    };
  }

  return {
    eligible: true, status: "ready", sourceCostAmount: cost, sellingPriceAmount: selling,
    marginPercent, minimumMarginPercent: minimum, reason: null,
  };
}
