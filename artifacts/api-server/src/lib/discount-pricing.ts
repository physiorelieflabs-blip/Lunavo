import { toMinorUnits } from "./money";

export interface DiscountCalculationInput {
  subtotalMinor: number;
  kind: string;
  value: string | number;
  currencyMinorDigits: number;
  /** Quantity of the one SKU represented by the current checkout order. */
  quantity?: number;
  /** Currency-minor unit price for that SKU; required for a same-SKU BOGO rule. */
  unitPriceMinor?: number;
  /** Same-SKU BOGO purchase and free quantities; each must be a whole number from 1 to 100. */
  buyQuantity?: number;
  getQuantity?: number;
}

/**
 * Calculate a server-authoritative discount in integer currency minor units.
 * Percentage values have two decimal places (10.00 means 10%); fixed values are
 * interpreted in the order currency. BOGO is same-SKU until the multi-line order
 * and split-fulfillment model can safely support cross-SKU bundles.
 */
export function calculateDiscountMinorUnits(input: DiscountCalculationInput): number | null {
  const { subtotalMinor, kind, value, currencyMinorDigits } = input;
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor <= 0) return null;
  if (!Number.isInteger(currencyMinorDigits) || currencyMinorDigits < 0 || currencyMinorDigits > 6) return null;

  if (kind === "bogo") {
    const quantity = input.quantity;
    const unitPriceMinor = input.unitPriceMinor;
    const buyQuantity = input.buyQuantity ?? 1;
    const getQuantity = input.getQuantity ?? 1;
    if (!Number.isSafeInteger(quantity) || quantity! < 1 || quantity! > 10_000) return null;
    if (!Number.isSafeInteger(unitPriceMinor) || unitPriceMinor! <= 0) return null;
    if (!Number.isSafeInteger(buyQuantity) || buyQuantity < 1 || buyQuantity > 100) return null;
    if (!Number.isSafeInteger(getQuantity) || getQuantity < 1 || getQuantity > 100) return null;
    const qualifyingGroupSize = buyQuantity + getQuantity;
    const freeUnits = Math.floor(quantity! / qualifyingGroupSize) * getQuantity;
    if (!Number.isSafeInteger(freeUnits) || freeUnits <= 0) return null;
    const discount = unitPriceMinor! * freeUnits;
    return Number.isSafeInteger(discount) && discount > 0 ? Math.min(subtotalMinor, discount) : null;
  }

  if (kind === "percentage") {
    const percentBasisPoints = toMinorUnits(value, 2);
    if (percentBasisPoints === null || percentBasisPoints <= 0 || percentBasisPoints > 10_000) return null;
    const discount = Number((BigInt(subtotalMinor) * BigInt(percentBasisPoints)) / 10_000n);
    return Number.isSafeInteger(discount) && discount > 0 ? Math.min(subtotalMinor, discount) : null;
  }

  if (kind === "fixed") {
    const fixedDiscountMinor = toMinorUnits(value, currencyMinorDigits);
    if (fixedDiscountMinor === null || fixedDiscountMinor <= 0) return null;
    return Math.min(subtotalMinor, fixedDiscountMinor);
  }

  return null;
}
