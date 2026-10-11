export type DiscountCodeRule = {
  id: number;
  code: string;
  kind: string;
  value: string | number;
  minimumSubtotal: string | number;
  currency: string | null;
  usageLimit: number | null;
  usageCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
};

export type DiscountEvaluation = {
  code: string;
  discountAmountMinor: number;
  subtotalMinor: number;
};

function moneyMinor(value: unknown, label: string): number {
  const amount = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  const minor = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(minor)) {
    throw new Error(`Discount code has an invalid ${label}.`);
  }
  return minor;
}

/** Validates a merchant-scoped rule and computes discounts in integer minor units. */
export function evaluateDiscountCode(
  rule: DiscountCodeRule,
  input: {
    subtotalMinor: number;
    currency: string;
    reservedUses: number;
    now?: Date;
  },
): DiscountEvaluation {
  const now = input.now ?? new Date();
  if (!rule.active) throw new Error("Discount code is inactive.");
  if (!/^[A-Z0-9_-]{3,40}$/.test(rule.code)) throw new Error("Discount code is invalid.");
  if (!Number.isSafeInteger(input.subtotalMinor) || input.subtotalMinor <= 0) {
    throw new Error("Discount code cannot be applied to an invalid subtotal.");
  }
  if (!Number.isSafeInteger(input.reservedUses) || input.reservedUses < 0) {
    throw new Error("Discount usage could not be verified.");
  }
  if (rule.currency && rule.currency.toUpperCase() !== input.currency.toUpperCase()) {
    throw new Error(`This discount code is only valid in ${rule.currency.toUpperCase()}.`);
  }
  if (rule.startsAt && now.getTime() < rule.startsAt.getTime()) {
    throw new Error("This discount code is not active yet.");
  }
  if (rule.endsAt && now.getTime() >= rule.endsAt.getTime()) {
    throw new Error("This discount code has expired.");
  }
  if (rule.usageLimit !== null) {
    if (!Number.isSafeInteger(rule.usageLimit) || rule.usageLimit < 1 ||
        !Number.isSafeInteger(rule.usageCount) || rule.usageCount < 0) {
      throw new Error("Discount usage limit is invalid.");
    }
    if (rule.usageCount + input.reservedUses >= rule.usageLimit) {
      throw new Error("This discount code has reached its usage limit.");
    }
  }
  const minimumSubtotalMinor = moneyMinor(rule.minimumSubtotal, "minimum subtotal");
  if (input.subtotalMinor < minimumSubtotalMinor) {
    throw new Error("Your order does not meet the minimum subtotal for this discount code.");
  }
  const value = typeof rule.value === "string" || typeof rule.value === "number" ? Number(rule.value) : Number.NaN;
  if (!Number.isFinite(value) || value <= 0) throw new Error("Discount code configuration is invalid.");
  let discountAmountMinor: number;
  if (rule.kind === "percentage") {
    if (value > 100) throw new Error("Discount percentage cannot exceed 100%.");
    discountAmountMinor = Math.round(input.subtotalMinor * value / 100);
  } else if (rule.kind === "fixed") {
    discountAmountMinor = moneyMinor(value, "value");
  } else {
    throw new Error("Discount code uses an unsupported discount type.");
  }
  discountAmountMinor = Math.max(0, Math.min(input.subtotalMinor, discountAmountMinor));
  return { code: rule.code, discountAmountMinor, subtotalMinor: input.subtotalMinor };
}
