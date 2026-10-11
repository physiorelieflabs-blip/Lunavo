export type FxRateSet = {
  unitsPerUsd: Record<string, number>;
  asOfByCurrency: Record<string, string>;
  sourceByCurrency: Record<string, string>;
};
export type FxPayload = { base: string; quote: string; rate: number; source: string; fetchedAt: string; asOf: string | null };
export const FX_RATE_MAX_AGE_MS = 5 * 24 * 60 * 60_000;
const MAX_CLOCK_SKEW_MS = 60 * 60_000;

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
function isoFromDateLabel(label: string): string | null {
  const value = label.trim();
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const dayFirst = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dayFirst) {
    const d = new Date(Date.UTC(Number(dayFirst[3]), Number(dayFirst[2]) - 1, Number(dayFirst[1]), 12));
    if (d.getUTCFullYear() !== Number(dayFirst[3]) || d.getUTCMonth() !== Number(dayFirst[2]) - 1 || d.getUTCDate() !== Number(dayFirst[1])) return null;
    return d.toISOString();
  }
  const monthFirst = value.match(/^([A-Za-z]+)[ -]+(\d{1,2})[-,/ ]+(\d{4})$/);
  if (monthFirst) {
    const month = Date.parse(`${monthFirst[1]} 1, 2000`);
    if (!Number.isFinite(month)) return null;
    const monthIndex = new Date(month).getUTCMonth();
    const year = Number(monthFirst[3]);
    const day = Number(monthFirst[2]);
    const d = new Date(Date.UTC(year, monthIndex, day, 12));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== monthIndex || d.getUTCDate() !== day) return null;
    return d.toISOString();
  }
  const normalized = value.replace(/[,]/g, " ").replace(/\s+/g, " ").replace(/([A-Za-z]+)[-](\d)/g, "$1 $2").replace(/(\d)[-]([A-Za-z]+)/g, "$1 $2");
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return null;
  const date = new Date(parsed);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12)).toISOString();
}
function amount(value: string | undefined): number | null {
  if (!value) return null;
  const number = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(number) && number > 0 ? number : null;
}
function textFromHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(?:td|th|tr|p|div|li|h[1-6]|br|section|article|table)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(Number(dec)))
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t\r]+/g, " ")
    .replace(/\n[ \t]+/g, "\n");
}
function rowsFromHtml(html: string): string[][] {
  const rows: string[][] = [];
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => textFromHtml(cell[1]).replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (cells.length) rows.push(cells);
  }
  return rows;
}
export function parseEcbReferenceRates(xml: string): FxRateSet {
  if (xml.length > 1_500_000) throw new Error("ECB rate document exceeds the size limit");
  const dateText = xml.match(/<Cube\b[^>]*\btime=["'](\d{4}-\d{2}-\d{2})["'][^>]*>/i)?.[1];
  const asOf = dateText ? isoFromDateLabel(dateText) : null;
  if (!asOf) throw new Error("ECB document has no valid reference date");
  const ratesPerEur: Record<string, number> = { EUR: 1 };
  for (const match of xml.matchAll(/<Cube\b[^>]*\bcurrency=["']([A-Z]{3})["'][^>]*\brate=["']([0-9]+(?:\.[0-9]+)?)["'][^>]*\/?\s*>/gi)) {
    const currency = match[1].toUpperCase();
    const rate = Number(match[2]);
    if (currency !== "EUR" && Number.isFinite(rate) && rate > 0) ratesPerEur[currency] = rate;
  }
  const usdPerEur = positive(ratesPerEur.USD);
  if (!usdPerEur) throw new Error("ECB document does not contain a valid USD/EUR rate");
  const unitsPerUsd: Record<string, number> = { USD: 1 };
  for (const [currency, unitsPerEur] of Object.entries(ratesPerEur)) {
    const rate = currency === "USD" ? 1 : unitsPerEur / usdPerEur;
    if (Number.isFinite(rate) && rate > 0) unitsPerUsd[currency] = rate;
  }
  return {
    unitsPerUsd,
    asOfByCurrency: Object.fromEntries(Object.keys(unitsPerUsd).map((currency) => [currency, asOf])),
    sourceByCurrency: Object.fromEntries(Object.keys(unitsPerUsd).map((currency) => [currency, "European Central Bank reference rates"])),
  };
}
/** CBN publishes the NFEM rate as NGN per USD. */
export function parseCbnNfemRate(html: string): FxRateSet {
  if (html.length > 2_000_000) throw new Error("CBN rate page exceeds the size limit");
  let found: { date: string; rate: number } | null = null;
  for (const cells of rowsFromHtml(html)) {
    const date = isoFromDateLabel(cells[0] ?? "");
    const rate = amount(cells[1]);
    if (date && rate !== null) { found = { date, rate }; break; }
  }
  if (!found) {
    const text = textFromHtml(html);
    const match = text.match(/([A-Za-z]+[- ]\d{1,2}[-, ]+\d{4})\s+([\d,]+(?:\.\d+)?)/);
    const date = match ? isoFromDateLabel(match[1]) : null;
    const rate = match ? amount(match[2]) : null;
    if (date && rate !== null && /NIGERIAN FOREIGN EXCHANGE MARKET|NFEM RATES/i.test(text)) found = { date, rate };
  }
  if (!found) throw new Error("Could not extract an official CBN NFEM NGN/USD rate");
  return {
    unitsPerUsd: { USD: 1, NGN: found.rate },
    asOfByCurrency: { USD: found.date, NGN: found.date },
    sourceByCurrency: { USD: "Central Bank of Nigeria NFEM", NGN: "Central Bank of Nigeria NFEM" },
  };
}
/** Bank of Ghana publishes the USDGHS mid-rate in its daily interbank table. */
export function parseBankOfGhanaRates(html: string): FxRateSet {
  if (html.length > 2_000_000) throw new Error("Bank of Ghana rate page exceeds the size limit");
  const observations: Record<string, { date: string; mid: number }> = {};
  for (const cells of rowsFromHtml(html)) {
    const pair = cells.find((cell) => ["USDGHS", "GHSNGN"].includes(cell.toUpperCase().replace(/\s+/g, "")));
    if (!pair) continue;
    const pairIndex = cells.findIndex((cell) => cell.toUpperCase().replace(/\s+/g, "") === pair.toUpperCase().replace(/\s+/g, ""));
    const date = isoFromDateLabel(cells[0] ?? "");
    const mid = amount(cells[pairIndex + 3]);
    if (date && mid !== null) observations[pair.toUpperCase()] = { date, mid };
  }
  if (!observations.USDGHS || !observations.GHSNGN) {
    const text = textFromHtml(html);
    const usd = text.match(/(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s+US Dollar\s+USDGHS\s+[\d,.]+\s+[\d,.]+\s+([\d,.]+)/i);
    const ngn = text.match(/(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s+Naira\s+GHSNGN\s+[\d,.]+\s+[\d,.]+\s+([\d,.]+)/i);
    if (!observations.USDGHS && usd) {
      const date = isoFromDateLabel(usd[1]), mid = amount(usd[2]);
      if (date && mid !== null) observations.USDGHS = { date, mid };
    }
    if (!observations.GHSNGN && ngn) {
      const date = isoFromDateLabel(ngn[1]), mid = amount(ngn[2]);
      if (date && mid !== null) observations.GHSNGN = { date, mid };
    }
  }
  const usdGhs = observations.USDGHS;
  if (!usdGhs) throw new Error("Could not extract the official Bank of Ghana USD/GHS mid-rate");
  const unitsPerUsd: Record<string, number> = { USD: 1, GHS: usdGhs.mid };
  const asOfByCurrency: Record<string, string> = { USD: usdGhs.date, GHS: usdGhs.date };
  const sourceByCurrency: Record<string, string> = {
    USD: "Bank of Ghana daily interbank rates",
    GHS: "Bank of Ghana daily interbank rates",
  };
  const ghsNgn = observations.GHSNGN;
  if (ghsNgn && ghsNgn.date === usdGhs.date) {
    const ngnPerUsd = usdGhs.mid * ghsNgn.mid;
    if (Number.isFinite(ngnPerUsd) && ngnPerUsd > 0) {
      unitsPerUsd.NGN = ngnPerUsd;
      asOfByCurrency.NGN = usdGhs.date;
      sourceByCurrency.NGN = "Bank of Ghana same-date GHS/NGN × USD/GHS cross-rate";
    }
  }
  return { unitsPerUsd, asOfByCurrency, sourceByCurrency };
}

/** CBK's daily rates page lists USD/KES plus a posted-on date. */
export function parseCentralBankOfKenyaRate(html: string): FxRateSet {
  if (html.length > 2_000_000) throw new Error("Central Bank of Kenya rate page exceeds the size limit");
  const text = textFromHtml(html);
  const dateLabel = text.match(/Posted On:\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})/i)?.[1]
    ?? text.match(/Daily KES Exchange Rates\s+(\d{1,2}[/-]\d{1,2}[/-]\d{4})/i)?.[1];
  const rateText = text.match(/Daily KES Exchange Rates[\s\S]{0,700}?US DOLLAR\s*[|:]?\s*([\d,]+(?:\.\d+)?)/i)?.[1]
    ?? text.match(/US DOLLAR\s*[|:]?\s*([\d,]+(?:\.\d+)?)[\s\S]{0,300}?Posted On:/i)?.[1];
  const date = dateLabel ? isoFromDateLabel(dateLabel) : null;
  const rate = amount(rateText);
  if (!date || rate === null) throw new Error("Could not extract an official CBK daily USD/KES rate");
  return {
    unitsPerUsd: { USD: 1, KES: rate },
    asOfByCurrency: { USD: date, KES: date },
    sourceByCurrency: { USD: "Central Bank of Kenya daily KES exchange rates", KES: "Central Bank of Kenya daily KES exchange rates" },
  };
}
function freshAsOf(value: string | undefined, now: number, maxAgeMs: number): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed > now + MAX_CLOCK_SKEW_MS || now - parsed > maxAgeMs) return null;
  return parsed;
}
export function mergeFreshFxRateSets(previous: FxRateSet | null, incoming: FxRateSet[], now = Date.now(), maxAgeMs = FX_RATE_MAX_AGE_MS): FxRateSet {
  const merged: FxRateSet = { unitsPerUsd: { USD: 1 }, asOfByCurrency: {}, sourceByCurrency: { USD: "USD numeraire" } };
  for (const set of [...incoming, ...(previous ? [previous] : [])]) {
    for (const [rawCurrency, rawRate] of Object.entries(set.unitsPerUsd)) {
      const currency = rawCurrency.toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency) || currency === "USD") continue;
      const rate = positive(rawRate);
      const epoch = freshAsOf(set.asOfByCurrency[currency], now, maxAgeMs);
      if (rate === null || epoch === null) continue;
      const oldEpoch = freshAsOf(merged.asOfByCurrency[currency], now, maxAgeMs);
      if (oldEpoch !== null && oldEpoch >= epoch) continue;
      merged.unitsPerUsd[currency] = rate;
      merged.asOfByCurrency[currency] = new Date(epoch).toISOString();
      merged.sourceByCurrency[currency] = set.sourceByCurrency[currency] ?? "Unknown source";
    }
  }
  return merged;
}
export function calculateFxPayload(baseValue: string, quoteValue: string, rates: FxRateSet, now = Date.now(), maxAgeMs = FX_RATE_MAX_AGE_MS): FxPayload {
  const base = baseValue.trim().toUpperCase();
  const quote = quoteValue.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(quote)) throw new Error("Currency codes must be three-letter ISO codes");
  const fetchedAt = new Date(now).toISOString();
  if (base === quote) return { base, quote, rate: 1, source: "Identity rate", fetchedAt, asOf: null };
  const baseRate = positive(rates.unitsPerUsd[base]);
  const quoteRate = positive(rates.unitsPerUsd[quote]);
  const rawBaseAsOf = base === "USD" ? rates.asOfByCurrency[quote] : rates.asOfByCurrency[base];
  const rawQuoteAsOf = quote === "USD" ? rates.asOfByCurrency[base] : rates.asOfByCurrency[quote];
  const baseAsOf = freshAsOf(rawBaseAsOf, now, maxAgeMs);
  const quoteAsOf = freshAsOf(rawQuoteAsOf, now, maxAgeMs);
  if (baseRate === null || quoteRate === null || baseAsOf === null || quoteAsOf === null) throw new Error(`A fresh locally stored FX rate for ${base}/${quote} is unavailable`);
  if (Math.abs(baseAsOf - quoteAsOf) > 3 * 24 * 60 * 60_000) throw new Error(`FX rates for ${base} and ${quote} are from materially different dates`);
  const rate = quoteRate / baseRate;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Calculated FX rate is invalid");
  const asOf = new Date(Math.min(baseAsOf, quoteAsOf)).toISOString();
  const baseSource = base === "USD" ? "USD numeraire" : (rates.sourceByCurrency[base] ?? "Unknown source");
  const quoteSource = quote === "USD" ? "USD numeraire" : (rates.sourceByCurrency[quote] ?? "Unknown source");
  return { base, quote, rate, source: `${baseSource}; ${quoteSource}`, fetchedAt, asOf };
}
