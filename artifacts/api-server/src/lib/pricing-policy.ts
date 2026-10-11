import { recommendDynamicPrice, type PricingInputs, type PricingResult } from "./dynamic-pricing";

export type MerchantPricingPolicy = {
  minMarginPercent: number;
  maxPriceMultiplier: number;
  requireApprovalForPriceChanges: boolean;
};

export type MerchantPricingOutcome =
  | { ok: true; result: PricingResult; requiresApproval: boolean }
  | { ok: false; code: "margin_below_floor" | "invalid_merchant_policy"; error: string };

export function recommendPriceWithMerchantPolicy(
  input: PricingInputs,
  policy: MerchantPricingPolicy,
): MerchantPricingOutcome {
  if (
    !Number.isFinite(policy.minMarginPercent) ||
    policy.minMarginPercent < 0 ||
    policy.minMarginPercent >= 100 ||
    !Number.isFinite(policy.maxPriceMultiplier) ||
    policy.maxPriceMultiplier <= 0 ||
    policy.maxPriceMultiplier > 100
  ) {
    return { ok: false, code: "invalid_merchant_policy", error: "Merchant pricing policy is invalid; review Master Automation settings" };
  }
  if (!Number.isSafeInteger(input.supplierCostMinor) || input.supplierCostMinor <= 0) {
    throw new Error("Invalid supplier cost");
  }
  if (input.targetMarginPercent < policy.minMarginPercent) {
    return {
      ok: false,
      code: "margin_below_floor",
      error: `Requested margin is below the merchant automation floor of ${policy.minMarginPercent}%`,
    };
  }
  const policyCap = Math.floor(input.supplierCostMinor * policy.maxPriceMultiplier);
  if (!Number.isSafeInteger(policyCap) || policyCap <= 0) {
    return { ok: false, code: "invalid_merchant_policy", error: "Merchant maximum price cap is outside the safe monetary range" };
  }
  const userCap = input.maxPriceMinor;
  const effectiveCap = userCap === undefined ? policyCap : Math.min(userCap, policyCap);
  const result = recommendDynamicPrice({ ...input, maxPriceMinor: effectiveCap });
  return { ok: true, result, requiresApproval: policy.requireApprovalForPriceChanges };
}
