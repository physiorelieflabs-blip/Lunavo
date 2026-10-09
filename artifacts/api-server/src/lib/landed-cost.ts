export type LandedCostInput = {
  sourceCostMinor: number;
  outboundShippingMinor: number;
  freightMinor: number;
  insuranceMinor: number;
  handlingMinor: number;
  packagingMinor: number;
  sellingPriceMinor: number;
  customsDutyBps: number;
  importTaxBps: number;
  platformFeeBps: number;
  providerFeeBps: number;
  returnsReserveBps: number;
};

export type LandedCostResult = {
  dutiableBaseMinor: number;
  customsDutyMinor: number;
  importTaxBaseMinor: number;
  importTaxMinor: number;
  landedCostMinor: number;
  platformFeeMinor: number;
  providerFeeMinor: number;
  returnsReserveMinor: number;
  contributionMarginMinor: number;
  contributionMarginBps: number;
  profitability: "profitable" | "break_even" | "loss";
  calculationVersion: "landed-cost-v1";
};

const AMOUNT_FIELDS = [
  "sourceCostMinor",
  "outboundShippingMinor",
  "freightMinor",
  "insuranceMinor",
  "handlingMinor",
  "packagingMinor",
  "sellingPriceMinor",
] as const;

const RATE_FIELDS = [
  "customsDutyBps",
  "importTaxBps",
  "platformFeeBps",
  "providerFeeBps",
  "returnsReserveBps",
] as const;

function safeNumber(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(label + " exceeds the supported exact-integer range");
  }
  return Number(value);
}

function rateAmount(baseMinor: bigint, rateBps: number): bigint {
  // Round half up in integer minor units; never use floating-point money math.
  return (baseMinor * BigInt(rateBps) + 5_000n) / 10_000n;
}

function ratioBps(numeratorMinor: bigint, denominatorMinor: bigint): number {
  if (denominatorMinor <= 0n) return 0;
  const scaled = numeratorMinor * 10_000n;
  const half = denominatorMinor / 2n;
  const rounded = scaled >= 0n
    ? (scaled + half) / denominatorMinor
    : (scaled - half) / denominatorMinor;
  const result = safeNumber(rounded, "Contribution margin basis points");
  if (result < -2_147_483_648 || result > 10_000) {
    throw new Error("Contribution margin ratio is outside the supported range; verify the price and cost inputs");
  }
  return result;
}

export function calculateLandedCost(input: LandedCostInput): LandedCostResult {
  for (const field of AMOUNT_FIELDS) {
    const value = input[field];
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(field + " must be a non-negative safe integer in minor currency units");
    }
  }
  for (const field of RATE_FIELDS) {
    const value = input[field];
    if (!Number.isInteger(value) || value < 0 || value > 10_000) {
      throw new Error(field + " must be an integer between 0 and 10000 basis points");
    }
  }

  const source = BigInt(input.sourceCostMinor);
  const shipping = BigInt(input.outboundShippingMinor);
  const freight = BigInt(input.freightMinor);
  const insurance = BigInt(input.insuranceMinor);
  const handling = BigInt(input.handlingMinor);
  const packaging = BigInt(input.packagingMinor);
  const sell = BigInt(input.sellingPriceMinor);

  // Explicit modeled assumptions: customs applies to goods + outbound shipping +
  // freight + insurance; import tax applies to that base + duty + handling + packaging.
  // Rates and cost inputs are operator-supplied estimates, not legal/tax authority.
  const dutiableBase = source + shipping + freight + insurance;
  const duty = rateAmount(dutiableBase, input.customsDutyBps);
  const importTaxBase = dutiableBase + duty + handling + packaging;
  const importTax = rateAmount(importTaxBase, input.importTaxBps);
  const landedCost = dutiableBase + handling + packaging + duty + importTax;
  const platformFee = rateAmount(sell, input.platformFeeBps);
  const providerFee = rateAmount(sell, input.providerFeeBps);
  const reserve = rateAmount(sell, input.returnsReserveBps);
  const margin = sell - landedCost - platformFee - providerFee - reserve;
  const marginBps = ratioBps(margin, sell);
  return {
    dutiableBaseMinor: safeNumber(dutiableBase, "Dutiable base"),
    customsDutyMinor: safeNumber(duty, "Customs duty"),
    importTaxBaseMinor: safeNumber(importTaxBase, "Import tax base"),
    importTaxMinor: safeNumber(importTax, "Import tax"),
    landedCostMinor: safeNumber(landedCost, "Landed cost"),
    platformFeeMinor: safeNumber(platformFee, "Platform fee"),
    providerFeeMinor: safeNumber(providerFee, "Provider fee"),
    returnsReserveMinor: safeNumber(reserve, "Returns reserve"),
    contributionMarginMinor: safeNumber(margin, "Contribution margin"),
    contributionMarginBps: marginBps,
    profitability: margin > 0n ? "profitable" : margin === 0n ? "break_even" : "loss",
    calculationVersion: "landed-cost-v1",
  };
}
