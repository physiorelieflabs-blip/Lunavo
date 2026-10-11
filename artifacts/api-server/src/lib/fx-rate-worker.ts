import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  calculateFxPayload,
  mergeFreshFxRateSets,
  parseBankOfGhanaRates,
  parseCbnNfemRate,
  parseCentralBankOfKenyaRate,
  parseEcbReferenceRates,
  type FxRateSet,
} from "./fx-rates";
import { logger } from "./logger";

const REFRESH_INTERVAL_MS = 3 * 60 * 60_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_CHARS = 2_000_000;
const FEEDS = [
  { id: "ecb", url: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", parse: parseEcbReferenceRates },
  { id: "cbn", url: "https://www.cbn.gov.ng/rates/ExchRateByCurrency.html", parse: parseCbnNfemRate },
  { id: "bog", url: "https://www.bog.gov.gh/treasury-and-the-markets/daily-interbank-fx-rates/", parse: parseBankOfGhanaRates },
  { id: "cbk", url: "https://www.centralbank.go.ke/forex/", parse: parseCentralBankOfKenyaRate },
] as const;

function objectRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; }
    catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function rateSetFromRow(row: Record<string, unknown>): FxRateSet {
  const rawRates = objectRecord(row.rates_per_usd);
  const unitsPerUsd: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawRates)) {
    const rate = Number(value);
    if (/^[A-Z]{3}$/.test(key) && Number.isFinite(rate) && rate > 0) unitsPerUsd[key] = rate;
  }
  const stringMap = (value: unknown): Record<string, string> => Object.fromEntries(
    Object.entries(objectRecord(value)).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  return {
    unitsPerUsd,
    asOfByCurrency: stringMap(row.as_of_by_currency),
    sourceByCurrency: stringMap(row.source_by_currency),
  };
}
async function fetchSource(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: "text/html,application/xml,text/xml;q=0.9,*/*;q=0.1", "User-Agent": "Lunavo-Local-FX-Snapshot/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`official rate source returned HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > MAX_RESPONSE_CHARS) throw new Error("official rate source exceeded the size limit");
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("text/html") && !contentType.includes("xml") && !contentType.includes("text/plain")) {
    throw new Error("official rate source returned an unsupported content type");
  }
  return body;
}
async function refreshOne(feed: (typeof FEEDS)[number]): Promise<FxRateSet> {
  const body = await fetchSource(feed.url);
  return feed.parse(body);
}
async function latestStoredSnapshot(): Promise<FxRateSet | null> {
  const result = await db.execute(sql`
    SELECT rates_per_usd, as_of_by_currency, source_by_currency
    FROM market_fx_rate_snapshots
    ORDER BY fetched_at DESC, id DESC
    LIMIT 1
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? rateSetFromRow(row) : null;
}
export async function runFxRateRefresh(): Promise<number> {
  const settled = await Promise.allSettled(FEEDS.map(refreshOne));
  const fetched: FxRateSet[] = [];
  const successes: string[] = [];
  settled.forEach((result, index) => {
    const source = FEEDS[index].id;
    if (result.status === "fulfilled") {
      fetched.push(result.value);
      successes.push(source);
    } else {
      logger.warn({ source, err: result.reason instanceof Error ? result.reason.message : "source failed" }, "Official FX source refresh failed");
    }
  });
  const latestIncoming = mergeFreshFxRateSets(null, fetched);
  const usableIncoming = Object.keys(latestIncoming.unitsPerUsd).filter((code) => code !== "USD");
  if (!usableIncoming.length) {
    logger.warn({ attempted: FEEDS.length, succeeded: successes }, "FX refresh found no fresh official currency rates; keeping last snapshot");
    return 0;
  }
  const previous = await latestStoredSnapshot().catch((error) => {
    logger.error({ err: error }, "Could not read existing local FX snapshot");
    return null;
  });
  const merged = mergeFreshFxRateSets(previous, fetched);
  const usableRates = Object.keys(merged.unitsPerUsd).filter((code) => code !== "USD");
  const sourceSummary = [...new Set(usableRates.map((code) => merged.sourceByCurrency[code]).filter(Boolean))].join("; ");
  await db.execute(sql`
    INSERT INTO market_fx_rate_snapshots
      (source_summary, rates_per_usd, as_of_by_currency, source_by_currency)
    VALUES
      (${sourceSummary}, ${JSON.stringify(merged.unitsPerUsd)}::jsonb, ${JSON.stringify(merged.asOfByCurrency)}::jsonb, ${JSON.stringify(merged.sourceByCurrency)}::jsonb)
  `);
  logger.info({ freshCurrencyCount: usableRates.length, freshSources: successes, sourceSummary }, "Self-hosted FX snapshot updated");
  return usableRates.length;
}
let running = false;
export function startFxRateWorker() {
  const run = async () => {
    if (running) return;
    running = true;
    try { await runFxRateRefresh(); }
    catch (error) { logger.error({ err: error }, "FX snapshot worker failed; prior snapshot retained"); }
    finally { running = false; }
  };
  void run();
  const timer = setInterval(() => void run(), REFRESH_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
