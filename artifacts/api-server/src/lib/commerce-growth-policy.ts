import { calculateFxPayload, type FxRateSet } from "./fx-rates";

const MAX_POSTGRES_SERIAL_ID = 2_147_483_647;
export const PRODUCT_ADVERTISING_FEE_USD_MINOR = 500;

/** supplier_products.id is a PostgreSQL serial, not a UUID. Accept number or digit-string API payloads. */
export function parseSupplierProductId(value: unknown): number | null {
  let raw: string;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_POSTGRES_SERIAL_ID) return null;
    return value;
  }
  if (typeof value !== "string") return null;
  raw = value.trim();
  if (!/^[1-9]\d{0,9}$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed <= MAX_POSTGRES_SERIAL_ID ? parsed : null;
}

/** A supplied storefront identifier must be a UUID and is always checked against the merchant at the API boundary. */
export function parseStorefrontId(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(raw) ? raw : null;
}

function minorUnitExponent(currencyValue: string): number {
  const currency = currencyValue.toUpperCase();
  if (/^(BIF|CLP|DJF|GNF|ISK|JPY|KMF|KRW|PYG|RWF|UGX|UYI|VND|VUV|XAF|XOF|XPF)$/.test(currency)) return 0;
  if (/^(BHD|IQD|JOD|KWD|LYD|OMR|TND)$/.test(currency)) return 3;
  return 2;
}

export type CampaignFeeQuote = {
  baseAmountMinor: number;
  baseCurrency: "USD";
  feeMinor: number;
  currency: string;
  fxRate: number;
  fxSource: string;
  fxAsOf: string | null;
  fxFetchedAt: string;
};

/** Price the USD 5 campaign fee in the merchant's authoritative currency using a fresh local FX snapshot. */
export function quoteProductAdvertisingFee(
  merchantCurrencyValue: string,
  rates: FxRateSet,
  now = Date.now(),
): CampaignFeeQuote {
  const currency = merchantCurrencyValue.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Merchant settlement currency is invalid");
  const baseAmountMinor = PRODUCT_ADVERTISING_FEE_USD_MINOR;
  const fx = calculateFxPayload("USD", currency, rates, now);
  const digits = minorUnitExponent(currency);
  const feeMinor = Math.round((baseAmountMinor / 100) * fx.rate * (10 ** digits));
  if (!Number.isSafeInteger(feeMinor) || feeMinor <= 0) throw new Error("Converted advertising fee is outside the supported money range");
  return {
    baseAmountMinor,
    baseCurrency: "USD",
    feeMinor,
    currency,
    fxRate: fx.rate,
    fxSource: fx.source,
    fxAsOf: fx.asOf,
    fxFetchedAt: fx.fetchedAt,
  };
}
