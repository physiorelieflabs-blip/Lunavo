import { describe, expect, it } from "vitest";
import { recommendPriceWithMerchantPolicy } from "./pricing-policy";

const policy = { minMarginPercent: 15, maxPriceMultiplier: 3, requireApprovalForPriceChanges: true };
const input = { supplierCostMinor: 5_000, targetMarginPercent: 20, marketLowMinor: 8_000, marketHighMinor: 20_000 };

describe("merchant pricing policy", () => {
  it("applies the merchant cap inside the canonical pricing engine", () => {
    const result = recommendPriceWithMerchantPolicy(input, policy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.maximumCommercialPriceMinor).toBe(15_000);
    expect(result.result.recommendedPriceMinor!).toBeLessThanOrEqual(15_000);
    expect(result.requiresApproval).toBe(true);
  });
  it("uses the merchant floor when the caller omits a margin (route responsibility is explicit)", () => {
    const result = recommendPriceWithMerchantPolicy({ ...input, targetMarginPercent: 15 }, policy);
    expect(result.ok).toBe(true);
  });
  it("rejects margins below the merchant floor", () => {
    const result = recommendPriceWithMerchantPolicy({ ...input, targetMarginPercent: 5 }, policy);
    expect(result).toMatchObject({ ok: false, code: "margin_below_floor" });
  });
  it("never permits a caller cap to weaken the merchant cap", () => {
    const result = recommendPriceWithMerchantPolicy({ ...input, maxPriceMinor: 19_000 }, policy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.maximumCommercialPriceMinor).toBe(15_000);
  });
  it("fails closed for invalid stored policy", () => {
    expect(recommendPriceWithMerchantPolicy(input, { ...policy, maxPriceMultiplier: 0 })).toMatchObject({ ok: false, code: "invalid_merchant_policy" });
  });
});
