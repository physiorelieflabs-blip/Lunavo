/** Shared deterministic price rule for supplier imports and scheduled source-cost changes. */
export function calculateSupplierSellingPrice(
  cost: string | number | null,
  profitType: string,
  profitValue: string | number,
  pricingMode = profitType === "percentage" ? "percentage_markup" : "fixed_markup",
  customSellingPrice: string | number | null | undefined = null,
): number | null {
  const amount = (value: string | number | null | undefined) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  if (pricingMode === "custom") {
    return customSellingPrice === null || customSellingPrice === undefined ? null : Number(amount(customSellingPrice).toFixed(2));
  }
  if (cost === null) return null;
  const costAmount = amount(cost);
  if (pricingMode === "same_price") return Number(costAmount.toFixed(2));
  const profitAmount = pricingMode === "percentage_markup" || profitType === "percentage"
    ? (costAmount * amount(profitValue)) / 100
    : amount(profitValue);
  return Number((costAmount + profitAmount).toFixed(2));
}
