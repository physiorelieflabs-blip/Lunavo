import { describe, expect, it } from "vitest";
import { calculateFxPayload, mergeFreshFxRateSets, parseBankOfGhanaRates, parseCbnNfemRate, parseCentralBankOfKenyaRate, parseEcbReferenceRates, type FxRateSet } from "./fx-rates";
const now = Date.parse("2026-10-11T12:00:00.000Z");

describe("self-hosted central-bank FX ingestion", () => {
  it("parses ECB EUR reference rates and normalizes all currencies to USD", () => {
    const xml = `<?xml version="1.0"?><Envelope><Cube><Cube time="2026-10-09"><Cube currency="USD" rate="1.1206"/><Cube currency="GBP" rate="0.84763"/><Cube currency="ZAR" rate="18.5270"/></Cube></Cube></Envelope>`;
    const rates = parseEcbReferenceRates(xml);
    expect(rates.unitsPerUsd.USD).toBe(1);
    expect(rates.unitsPerUsd.EUR).toBeCloseTo(1 / 1.1206, 8);
    expect(rates.unitsPerUsd.GBP).toBeCloseTo(0.84763 / 1.1206, 8);
    expect(rates.asOfByCurrency.ZAR).toBe("2026-10-09T12:00:00.000Z");
    expect(rates.sourceByCurrency.EUR).toContain("European Central Bank");
  });
  it("rejects malformed ECB XML", () => expect(() => parseEcbReferenceRates("<Cube time='2026-10-09'/>")).toThrow(/USD\/EUR/));
  it("parses CBN NFEM NGN per USD", () => {
    const html = `<h2>NIGERIAN FOREIGN EXCHANGE MARKET (NFEM) RATES</h2><table><tr><th>Date</th><th>NFEM Rate (₦/US$)</th></tr><tr><td>October-09-2026</td><td>1,501.2500</td><td>1,504</td></tr></table>`;
    const rates = parseCbnNfemRate(html);
    expect(rates.unitsPerUsd.NGN).toBe(1501.25);
    expect(rates.asOfByCurrency.NGN).toBe("2026-10-09T12:00:00.000Z");
  });
  it("parses Bank of Ghana USDGHS mid-rate", () => {
    const html = `<table><tr><th>Date</th><th>Currency</th><th>Currency Pair</th><th>Buying</th><th>Selling</th><th>Mid Rate</th></tr><tr><td>09 Oct 2026</td><td>US Dollar</td><td>USDGHS</td><td>11.7841</td><td>11.7959</td><td>11.7900</td></tr><tr><td>09 Oct 2026</td><td>Naira</td><td>GHSNGN</td><td>112.8634</td><td>112.9975</td><td>112.9305</td></tr></table>`;
    const rates = parseBankOfGhanaRates(html);
    expect(rates.unitsPerUsd.GHS).toBe(11.79);
    expect(rates.unitsPerUsd.NGN).toBeCloseTo(11.79 * 112.9305, 6);
    expect(rates.sourceByCurrency.NGN).toContain("same-date GHS/NGN");
    expect(rates.asOfByCurrency.NGN).toBe("2026-10-09T12:00:00.000Z");
    expect(rates.asOfByCurrency.GHS).toBe("2026-10-09T12:00:00.000Z");
  });
  it("parses Central Bank of Kenya daily USD/KES rate", () => {
    const rates = parseCentralBankOfKenyaRate(`<h3>Daily KES Exchange Rates</h3><p>US DOLLAR | 129.91</p><p>Posted On: 09-10-2026</p>`);
    expect(rates.unitsPerUsd.KES).toBe(129.91);
    expect(rates.asOfByCurrency.KES).toBe("2026-10-09T12:00:00.000Z");
  });
  it("merges feeds without replacing a fresher rate with an older observation", () => {
    const fresh: FxRateSet = { unitsPerUsd: { USD: 1, EUR: 0.9, NGN: 1500 }, asOfByCurrency: { EUR: "2026-10-10T12:00:00.000Z", NGN: "2026-10-10T12:00:00.000Z" }, sourceByCurrency: { EUR: "ECB", NGN: "CBN" } };
    const old: FxRateSet = { unitsPerUsd: { USD: 1, EUR: 0.8, NGN: 1400, KES: 130 }, asOfByCurrency: { EUR: "2026-10-09T12:00:00.000Z", NGN: "2026-10-09T12:00:00.000Z", KES: "2026-10-09T12:00:00.000Z" }, sourceByCurrency: { EUR: "old ECB", NGN: "old CBN", KES: "CBK" } };
    const merged = mergeFreshFxRateSets(old, [fresh], now);
    expect(merged.unitsPerUsd.EUR).toBe(0.9);
    expect(merged.unitsPerUsd.NGN).toBe(1500);
    expect(merged.unitsPerUsd.KES).toBe(130);
  });
  it("calculates cross-rates and preserves both source labels", () => {
    const rates: FxRateSet = { unitsPerUsd: { USD: 1, EUR: 0.9, NGN: 1500 }, asOfByCurrency: { EUR: "2026-10-10T12:00:00.000Z", NGN: "2026-10-10T12:00:00.000Z" }, sourceByCurrency: { EUR: "ECB", NGN: "CBN NFEM" } };
    const result = calculateFxPayload("EUR", "NGN", rates, now);
    expect(result.rate).toBeCloseTo(1500 / 0.9, 8);
    expect(result.source).toContain("ECB");
    expect(result.source).toContain("CBN NFEM");
  });
  it("supports USD as the numeraire while still requiring the other rate", () => {
    const rates: FxRateSet = { unitsPerUsd: { USD: 1, NGN: 1500 }, asOfByCurrency: { NGN: "2026-10-10T12:00:00.000Z" }, sourceByCurrency: { NGN: "CBN NFEM" } };
    expect(calculateFxPayload("USD", "NGN", rates, now).rate).toBe(1500);
    expect(calculateFxPayload("NGN", "USD", rates, now).rate).toBeCloseTo(1 / 1500, 10);
    expect(() => calculateFxPayload("USD", "KES", rates, now)).toThrow(/fresh locally stored FX rate/);
  });
  it("blocks stale rates and cross-rates with materially different source dates", () => {
    const stale: FxRateSet = { unitsPerUsd: { USD: 1, NGN: 1500 }, asOfByCurrency: { NGN: "2026-09-01T12:00:00.000Z" }, sourceByCurrency: { NGN: "CBN NFEM" } };
    expect(mergeFreshFxRateSets(null, [stale], now).unitsPerUsd.NGN).toBeUndefined();
    const mixedDates: FxRateSet = { unitsPerUsd: { USD: 1, EUR: 0.9, NGN: 1500 }, asOfByCurrency: { EUR: "2026-10-10T12:00:00.000Z", NGN: "2026-10-01T12:00:00.000Z" }, sourceByCurrency: { EUR: "ECB", NGN: "CBN" } };
    expect(() => calculateFxPayload("EUR", "NGN", mixedDates, now)).toThrow(/materially different dates/);
  });
});
