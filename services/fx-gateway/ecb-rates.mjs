const MAX_ECB_XML_BYTES = 512_000;
const MIN_ECB_CURRENCY_COUNT = 10;

function attribute(attributes, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = attributes.match(new RegExp("\\b" + escaped + '="([^"]*)"'));
  return match?.[1] ?? null;
}

/**
 * Parse the ECB's public daily XML reference-rate feed.
 * Values represent currency units per EUR, never provider settlement quotes.
 */
export function parseEcbRatesXml(xml) {
  if (typeof xml !== "string" || xml.length === 0 || Buffer.byteLength(xml, "utf8") > MAX_ECB_XML_BYTES) {
    throw new Error("ECB FX response is empty or exceeds the allowed size");
  }

  const dateMatch = xml.match(/<Cube\\b[^>]*\\btime="(\\d{4}-\\d{2}-\\d{2})"/);
  const asOf = dateMatch?.[1] ?? null;
  if (!asOf) throw new Error("ECB FX response is missing its observation date");
  const asOfDate = new Date(asOf + "T00:00:00Z");
  if (Number.isNaN(asOfDate.getTime()) || asOfDate.toISOString().slice(0, 10) !== asOf) {
    throw new Error("ECB FX response contains an invalid observation date");
  }

  const rates = { EUR: 1 };
  const cubes = xml.matchAll(/<Cube\\b([^>]*)\\/?\\s*>/g);
  for (const cube of cubes) {
    const currency = attribute(cube[1], "currency");
    if (!currency) continue;
    if (!/^[A-Z]{3}$/.test(currency) || currency === "EUR") {
      throw new Error("ECB FX response contains an invalid currency code");
    }
    if (Object.prototype.hasOwnProperty.call(rates, currency)) {
      throw new Error("ECB FX response contains a duplicate currency");
    }
    const rawRate = attribute(cube[1], "rate");
    if (!rawRate || !/^\\d+(?:\\.\\d+)?$/.test(rawRate)) {
      throw new Error("ECB FX response contains an invalid rate");
    }
    const rate = Number(rawRate);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1_000_000_000) {
      throw new Error("ECB FX response contains an out-of-range rate");
    }
    rates[currency] = rate;
  }

  if (Object.keys(rates).length < MIN_ECB_CURRENCY_COUNT) {
    throw new Error("ECB FX response contains too few currency observations");
  }
  return { base: "EUR", asOf, rates };
}

/** Convert through the EUR reference-rate base; returns null if either code is uncovered. */
export function crossRateFromEuroRates(rates, base, quote) {
  const normalizedBase = String(base ?? "").trim().toUpperCase();
  const normalizedQuote = String(quote ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedBase) || !/^[A-Z]{3}$/.test(normalizedQuote)) return null;
  if (normalizedBase === normalizedQuote) return 1;

  const basePerEur = Number(rates?.[normalizedBase]);
  const quotePerEur = Number(rates?.[normalizedQuote]);
  if (
    !Number.isFinite(basePerEur) || basePerEur <= 0 ||
    !Number.isFinite(quotePerEur) || quotePerEur <= 0
  ) return null;

  const rate = quotePerEur / basePerEur;
  return Number.isFinite(rate) && rate > 0 && rate <= 1_000_000_000 ? rate : null;
}
