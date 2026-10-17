import assert from "node:assert/strict";
import test from "node:test";
import { crossRateFromEuroRates, parseEcbRatesXml } from "./ecb-rates.mjs";

const sampleRates = [
  ["USD", "1.1253"],
  ["JPY", "177.82"],
  ["GBP", "0.84385"],
  ["INR", "104.52"],
  ["CNY", "8.11"],
  ["CAD", "1.55"],
  ["AUD", "1.73"],
  ["CHF", "0.93"],
  ["MXN", "20.8"],
  ["BRL", "6.1"],
];

function feed(rows = sampleRates, date = "2026-10-16") {
  const observations = rows.map(([currency, rate]) => `<Cube currency="${currency}" rate="${rate}"/>`).join("");
  return `<?xml version="1.0"?><gesmes:Envelope><Cube><Cube time="${date}">${observations}</Cube></Cube></gesmes:Envelope>`;
}

test("parses a dated ECB feed and preserves EUR as the base", () => {
  const snapshot = parseEcbRatesXml(feed());
  assert.equal(snapshot.base, "EUR");
  assert.equal(snapshot.asOf, "2026-10-16");
  assert.equal(snapshot.rates.EUR, 1);
  assert.equal(snapshot.rates.USD, 1.1253);
  assert.equal(snapshot.rates.JPY, 177.82);
});

test("calculates cross rates through EUR without rounding the quote", () => {
  const snapshot = parseEcbRatesXml(feed());
  assert.equal(crossRateFromEuroRates(snapshot.rates, "EUR", "USD"), 1.1253);
  assert.ok(Math.abs(crossRateFromEuroRates(snapshot.rates, "USD", "JPY") - 177.82 / 1.1253) < 1e-12);
  assert.equal(crossRateFromEuroRates(snapshot.rates, "USD", "USD"), 1);
  assert.equal(crossRateFromEuroRates(snapshot.rates, "NGN", "USD"), null);
  assert.equal(crossRateFromEuroRates(snapshot.rates, "US", "USD"), null);
});

test("rejects missing or invalid dates and undersized rate feeds", () => {
  assert.throws(() => parseEcbRatesXml("<Cube><Cube currency=\"USD\" rate=\"1.2\"/></Cube>/"), /observation date/i);
  assert.throws(() => parseEcbRatesXml(feed(sampleRates.slice(0, 4))), /too few/i);
  assert.throws(() => parseEcbRatesXml(feed(sampleRates, "2026-13-40")), /invalid observation date/i);
});

test("rejects duplicate currencies and malformed or non-positive rates", () => {
  assert.throws(() => parseEcbRatesXml(feed([...sampleRates, ["USD", "1.3"]])), /duplicate currency/i);
  const malformed = sampleRates.map(([currency, rate]) => [currency, currency === "USD" ? "1.2x" : rate]);
  assert.throws(() => parseEcbRatesXml(feed(malformed)), /invalid rate/i);
  const zero = sampleRates.map(([currency, rate]) => [currency, currency === "USD" ? "0" : rate]);
  assert.throws(() => parseEcbRatesXml(feed(zero)), /out-of-range rate/i);
});
