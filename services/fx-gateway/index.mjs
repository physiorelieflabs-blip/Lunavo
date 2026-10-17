import http from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { crossRateFromEuroRates, parseEcbRatesXml } from "./ecb-rates.mjs";

const port = Number(process.env.PORT || "8081");
const ratesFile = process.env.FX_RATES_FILE?.trim() || "/data/lunavo/fx-rates.json";
const supported = /^[A-Z]{3}$/;
const ratebookTtlMs = 60_000;
const ecbRefreshIntervalMs = 6 * 60 * 60 * 1000;
const ecbRetryIntervalMs = 15 * 60 * 1000;
const ecbFetchTimeoutMs = 8_000;
const staleAfterMs = 48 * 60 * 60 * 1000;
const ecbFeedUrl = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

let ratebook = { loadedAt: 0, updatedAt: null, rates: {} };
let ecbSnapshot = {
  base: "EUR",
  asOf: null,
  fetchedAt: null,
  lastAttemptAt: 0,
  lastError: null,
  rates: { EUR: 1 },
};
let ecbRefreshPromise = null;

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function isoTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

async function loadRates() {
  try {
    const raw = await readFile(ratesFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("FX ratebook must be an object");
    }
    const rates = parsed.rates;
    if (!rates || typeof rates !== "object" || Array.isArray(rates)) {
      throw new Error("FX ratebook is missing a rates object");
    }
    ratebook = {
      loadedAt: Date.now(),
      updatedAt: isoTimestamp(parsed.updatedAt),
      rates,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      ratebook = { loadedAt: Date.now(), updatedAt: null, rates: {} };
      return;
    }
    throw error;
  }
}

async function refreshEcbRates() {
  if (ecbRefreshPromise) return ecbRefreshPromise;
  const attemptedAt = Date.now();
  ecbSnapshot = { ...ecbSnapshot, lastAttemptAt: attemptedAt };
  ecbRefreshPromise = (async () => {
    try {
      const response = await fetch(ecbFeedUrl, {
        headers: { accept: "application/xml, text/xml" },
        signal: AbortSignal.timeout(ecbFetchTimeoutMs),
      });
      if (!response.ok) throw new Error("ECB FX feed returned HTTP " + response.status);
      const contentLength = Number(response.headers.get("content-length") || "0");
      if (contentLength > 512_000) throw new Error("ECB FX response exceeds the allowed size");
      const xml = await response.text();
      const parsed = parseEcbRatesXml(xml);
      ecbSnapshot = {
        ...parsed,
        fetchedAt: new Date().toISOString(),
        lastAttemptAt: attemptedAt,
        lastError: null,
      };
      return true;
    } catch (error) {
      ecbSnapshot = {
        ...ecbSnapshot,
        lastAttemptAt: attemptedAt,
        lastError: error instanceof Error ? error.message : "Unknown ECB feed error",
      };
      return false;
    } finally {
      ecbRefreshPromise = null;
    }
  })();
  return ecbRefreshPromise;
}

async function ensureEcbRatesFresh() {
  if (ecbRefreshPromise) {
    await ecbRefreshPromise;
    return;
  }
  const now = Date.now();
  const fetchedAtMs = ecbSnapshot.fetchedAt ? Date.parse(ecbSnapshot.fetchedAt) : 0;
  if (now - fetchedAtMs <= ecbRefreshIntervalMs) return;
  if (now - ecbSnapshot.lastAttemptAt < ecbRetryIntervalMs) return;
  await refreshEcbRates();
}

function ecbQuote(base, quote) {
  if (!ecbSnapshot.fetchedAt) return null;
  const rate = crossRateFromEuroRates(ecbSnapshot.rates, base, quote);
  if (rate === null) return null;
  const ageMs = Math.max(0, Date.now() - Date.parse(ecbSnapshot.fetchedAt));
  return {
    rate,
    source: "ecb-reference-rates",
    fetchedAt: ecbSnapshot.fetchedAt,
    asOf: ecbSnapshot.asOf,
    indicativeOnly: true,
    stale: ageMs > staleAfterMs,
  };
}

function ratebookQuote(base, quote) {
  const asOfMs = ratebook.updatedAt ? Date.parse(ratebook.updatedAt) : 0;
  const ageMs = Date.now() - asOfMs;
  const ratebookStale = !asOfMs || ageMs < -5 * 60 * 1000 || ageMs > staleAfterMs;
  const direct = Number(ratebook.rates[base]?.[quote]);
  if (Number.isFinite(direct) && direct > 0 && direct <= 1_000_000_000) {
    return {
      rate: direct,
      source: "self-hosted-admin-ratebook",
      fetchedAt: null,
      asOf: ratebook.updatedAt,
      loadedAt: ratebook.loadedAt ? new Date(ratebook.loadedAt).toISOString() : null,
      indicativeOnly: true,
      stale: ratebookStale,
    };
  }
  const inverse = Number(ratebook.rates[quote]?.[base]);
  if (Number.isFinite(inverse) && inverse > 0 && inverse <= 1_000_000_000) {
    return {
      rate: 1 / inverse,
      source: "self-hosted-admin-ratebook",
      fetchedAt: null,
      asOf: ratebook.updatedAt,
      loadedAt: ratebook.loadedAt ? new Date(ratebook.loadedAt).toISOString() : null,
      indicativeOnly: true,
      stale: true,
    };
  }
  return null;
}

async function rateFor(base, quote) {
  if (Date.now() - ratebook.loadedAt > ratebookTtlMs) await loadRates();

  // Official ECB reference rates take priority whenever both currencies are covered.
  // They are indicative only and never authorize or settle a payment.
  const official = ecbQuote(base, quote);
  if (official) return official;

  // Keep a self-hosted ratebook fallback for currencies not covered by the ECB feed.
  const configured = ratebookQuote(base, quote);
  if (configured) return configured;

  throw new Error(
    "No reference rate is available for " + base + "/" + quote +
    ". The ECB feed does not cover this pair and the self-hosted ratebook has no matching entry.",
  );
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://fx-gateway.local");
    if (req.method === "GET" && url.pathname === "/health") {
      await loadRates();
      await ensureEcbRatesFresh();
      const fetchedAtMs = ecbSnapshot.fetchedAt ? Date.parse(ecbSnapshot.fetchedAt) : 0;
      json(res, 200, {
        ok: true,
        service: "self-hosted-fx-gateway",
        configuredPairs: Object.values(ratebook.rates).reduce(
          (count, row) => count + Object.keys(row || {}).length,
          0,
        ),
        ecb: {
          available: Boolean(ecbSnapshot.fetchedAt),
          asOf: ecbSnapshot.asOf,
          fetchedAt: ecbSnapshot.fetchedAt,
          stale: !fetchedAtMs || Date.now() - fetchedAtMs > staleAfterMs,
          lastError: ecbSnapshot.lastError,
        },
        ratebook: {
          loadedAt: ratebook.loadedAt ? new Date(ratebook.loadedAt).toISOString() : null,
          asOf: ratebook.updatedAt,
        },
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/rate") {
      const base = String(url.searchParams.get("base") || "").trim().toUpperCase();
      const quote = String(url.searchParams.get("quote") || "").trim().toUpperCase();
      if (!supported.test(base) || !supported.test(quote)) {
        json(res, 400, { error: "base and quote must be ISO 4217 currency codes" });
        return;
      }
      if (base === quote) {
        const now = new Date().toISOString();
        json(res, 200, {
          base,
          quote,
          rate: 1,
          source: "identity",
          fetchedAt: now,
          asOf: now,
          indicativeOnly: true,
          stale: false,
        });
        return;
      }
      await ensureEcbRatesFresh();
      const quoteResult = await rateFor(base, quote);
      json(res, 200, { base, quote, ...quoteResult });
      return;
    }
    json(res, 404, { error: "Not found" });
  } catch (error) {
    json(res, 503, {
      error: error instanceof Error ? error.message : "Self-hosted FX service unavailable",
    });
  }
});

void mkdir(path.dirname(ratesFile), { recursive: true })
  .then(() => loadRates())
  .catch(() => undefined);

void refreshEcbRates();
const refreshTimer = setInterval(() => {
  void ensureEcbRatesFresh();
}, ecbRefreshIntervalMs);
refreshTimer.unref();

server.listen(port, "0.0.0.0", () => {
  console.log("Self-hosted FX gateway listening on " + port + "; ratesFile=" + ratesFile);
});
