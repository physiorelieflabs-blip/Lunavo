import { describe, expect, it } from "vitest";
import { currencyMinorDigits } from "./money";
import {
  FLUTTERWAVE_PAYMENT_CURRENCIES,
  SUPPORTED_CURRENCIES,
  isFlutterwavePaymentCurrency,
  isSupportedStoreCurrency,
} from "./currency-support";

describe("store currency coverage", () => {
  it("offers a broad selection of major two-minor-digit currencies", () => {
    for (const currency of [
      "USD", "NGN", "EUR", "GBP", "CAD", "AUD", "CHF", "CNY",
      "HKD", "INR", "SGD", "NZD", "BRL", "MXN", "MYR", "THB",
      "PHP", "PLN", "SEK", "NOK", "DKK", "CZK", "RON",
      "TRY", "ILS", "EGP", "PKR", "BDT", "TWD", "COP", "PEN",
      "ARS", "KZT", "UAH", "MAD", "DZD", "QAR", "LKR", "NPR",
      "MUR", "IDR",
    ]) {
      expect(isSupportedStoreCurrency(currency), currency).toBe(true);
    }
  });

  it("only exposes store currencies whose current runtime minor precision is two digits", () => {
    for (const currency of SUPPORTED_CURRENCIES) {
      expect(currencyMinorDigits(currency), currency).toBe(2);
    }
  });

  it("keeps store currency choices independent from the Flutterwave payment allowlist", () => {
    expect(SUPPORTED_CURRENCIES.length).toBeGreaterThan(30);
    expect(FLUTTERWAVE_PAYMENT_CURRENCIES.length).toBeLessThan(SUPPORTED_CURRENCIES.length);
    for (const currency of FLUTTERWAVE_PAYMENT_CURRENCIES) {
      expect(isSupportedStoreCurrency(currency), currency).toBe(true);
      expect(isFlutterwavePaymentCurrency(currency), currency).toBe(true);
    }
    expect(isSupportedStoreCurrency("JPY")).toBe(false);
    expect(isSupportedStoreCurrency("BHD")).toBe(false);
    expect(isFlutterwavePaymentCurrency("CHF")).toBe(false);
  });

  it("normalizes user-entered ISO codes but rejects unknown and malformed codes", () => {
    expect(isSupportedStoreCurrency(" eur ")).toBe(true);
    expect(isFlutterwavePaymentCurrency("ngn")).toBe(true);
    expect(isSupportedStoreCurrency("US")).toBe(false);
    expect(isSupportedStoreCurrency("NOT-A-CURRENCY")).toBe(false);
    expect(isFlutterwavePaymentCurrency("JPY")).toBe(false);
  });
});
