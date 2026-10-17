/**
 * Lunavo store/transaction currencies.
 *
 * These currently use two minor digits because several monetary persistence and
 * reporting paths still store/render two-decimal amounts. Zero- and three-minor-
 * digit currencies must not be added until those paths are migrated together.
 */
export const SUPPORTED_CURRENCIES = [
  "USD", "NGN", "GHS", "KES", "ZAR", "GBP", "EUR", "CAD", "AUD",
  "CHF", "CNY", "HKD", "INR", "SGD", "NZD", "BRL", "MXN", "MYR",
  "THB", "PHP", "PLN", "SEK", "NOK", "DKK", "CZK", "HUF", "RON",
  "TRY", "ILS", "EGP", "PKR", "BDT", "TWD", "COP", "PEN", "ARS",
  "KZT", "UAH", "MAD", "DZD", "QAR", "LKR", "NPR", "MUR", "IDR",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Conservative currencies currently accepted by the Flutterwave checkout
 * adapter. This list is intentionally independent of store currency choices.
 * Expanding it requires verifying current provider/account capabilities and
 * settlement handling, not merely adding a code to the store picker.
 */
export const FLUTTERWAVE_PAYMENT_CURRENCIES = [
  "USD", "NGN", "GHS", "KES", "ZAR", "GBP", "EUR", "CAD", "AUD",
] as const;

export function isSupportedStoreCurrency(value: unknown): value is SupportedCurrency {
  return typeof value === "string" &&
    (SUPPORTED_CURRENCIES as readonly string[]).includes(value.trim().toUpperCase());
}

export function isFlutterwavePaymentCurrency(value: unknown): boolean {
  return typeof value === "string" &&
    (FLUTTERWAVE_PAYMENT_CURRENCIES as readonly string[]).includes(value.trim().toUpperCase());
}
