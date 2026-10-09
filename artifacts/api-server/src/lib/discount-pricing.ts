import { toMinorUnits } from "./money";

export interface DiscountCalculationInput {
  subtotalMinor: number;
  kind: string;
  value: string | number;
  currencyMinorDigits: number;
}

/**
 * Calculate a server-authoritative discount in integer currency minor units.
 * Percentage values have two decimal places (10.00 means 10%); fixed values
 * are interpreted in the order currency and are never allowed to exceed subtotal.
 */
export function calculateDiscountMinorUnits(input: DiscountCalculationInput): number | null {
  const { subtotalMinor, kind, value, currencyMinorDigits } = input;
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor <= 0) return null;
  if (!Number.isInteger(currencyMinorDigits) || currencyMinorDigits < 0 || currencyMinorDigits > 6) return null;

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
