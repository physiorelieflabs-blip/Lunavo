import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { emitDomainEvent } from "./domain-events";
import { logger } from "./logger";
import { importPublicSupplierProduct } from "./public-supplier";
import { buildPublicMarketObservation } from "./public-market-observation";
import { recordMarketResearch } from "./dropship-intelligence";
import { summarizeMarketWatchChange } from "./dropship-market-watch-diff";
import {
  marketWatchRetryDelaySeconds,
  marketWatchStatusAfterFailure,
} from "./dropship-market-watch-policy";

const POLL_MS = 30_000;
const BATCH_SIZE = 2;
const LEASE_MINUTES = 20;
let running = false;

type MarketWatch = {
  id: string;
  merchant_id: number;
  supplier_product_id: number | null;
  source_kind: "competitor" | "ad_spy";
  source_url: string;
  interval_minutes: number;
  status: string;
  claim_token: string;
  created_by: string;
  consecutive_failures: number;
  last_observed_currency: string | null;
  last_observed_price_minor: string | number | null;
  last_observed_availability: string | null;
};

function safeCaptureError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timed out") || message.includes("timeout")) return "The public product page timed out.";
  if (message.includes("private") || message.includes("internal") || message.includes("reserved")) {
    return "The URL resolved to a private or reserved network address; capture was refused.";
  }
  const status = message.match(/http\s+(\d{3})/);
  if (status) return `The source page returned HTTP ${status[1]}.`;
  return "Lunavo could not safely read this public product page. Confirm that it is accessible without signing in.";
}

async function claimNextWatch(): Promise<MarketWatch | null> {
  const result = await db.execute(sql`
    WITH candidate AS (
      SELECT id
      FROM dropship_market_watches
      WHERE status='active'
        AND next_capture_at <= now()
        AND (locked_at IS NULL OR locked_at < now() - (${LEASE_MINUTES} * interval '1 minute'))
      ORDER BY next_capture_at ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE dropship_market_watches AS watch
    SET claim_token=gen_random_uuid(),locked_at=now(),updated_at=now()
    FROM candidate
    WHERE watch.id=candidate.id
    RETURNING watch.*
  `);
  return (result.rows[0] as MarketWatch | undefined) ?? null;
}

async function recordWatchFailure(watch: MarketWatch, error: unknown): Promise<void> {
  const nextFailures = Math.min(1_000_000, Number(watch.consecutive_failures || 0) + 1);
  const status = marketWatchStatusAfterFailure(nextFailures);
  const delaySeconds = marketWatchRetryDelaySeconds(nextFailures);
  const message = safeCaptureError(error);
  await db.execute(sql`
    UPDATE dropship_market_watches
    SET status=${status},
        last_error=${message},
        last_checked_at=now(),
        consecutive_failures=${nextFailures},
        next_capture_at=CASE WHEN ${status}='failed'
          THEN now()+interval '1 day'
          ELSE now()+(${delaySeconds} * interval '1 second')
        END,
        claim_token=NULL,locked_at=NULL,updated_at=now()
    WHERE id=${watch.id}::uuid AND status='active' AND claim_token=${watch.claim_token}::uuid
  `);
  logger.warn({ watchId: watch.id, consecutiveFailures: nextFailures, outcome: status }, "Scheduled market-watch capture did not complete");
}

async function captureWatch(watch: MarketWatch): Promise<void> {
  try {
    const captured = await importPublicSupplierProduct(watch.source_url);
    const observation = buildPublicMarketObservation({
      sourceKind: watch.source_kind,
      requestedUrl: watch.source_url,
      captured,
      capturedAt: new Date(),
    });
    const change = summarizeMarketWatchChange({
      previousPriceMinor: watch.last_observed_price_minor,
      previousCurrency: watch.last_observed_currency,
      previousAvailability: watch.last_observed_availability,
      currentPriceMinor: observation.observedPriceMinor,
      currentCurrency: observation.currency,
      currentAvailability: captured.availability,
    });
    const idempotencyKey = `market-watch:${watch.id}:${watch.claim_token}`;
    const requestFingerprint = createHash("sha256").update(JSON.stringify({
      watchId: watch.id,
      claimToken: watch.claim_token,
      sourceUrl: watch.source_url,
      sourceKind: watch.source_kind,
      supplierProductId: watch.supplier_product_id,
    })).digest("hex");

    await db.transaction(async (tx) => {
      const currentResult = await tx.execute(sql`
        SELECT id,status,claim_token
        FROM dropship_market_watches
        WHERE id=${watch.id}::uuid
        FOR UPDATE
      `);
      const current = currentResult.rows[0] as { id: string; status: string; claim_token: string | null } | undefined;
      // A pause/delete/reclaim that occurred during the network request fences this result.
      if (!current || current.status !== "active" || current.claim_token !== watch.claim_token) return;

      const research = await recordMarketResearch({
        merchantId: Number(watch.merchant_id),
        supplierProductId: watch.supplier_product_id,
        sourceKind: watch.source_kind,
        sourceUrl: observation.sourceUrl,
        currency: observation.currency,
        observedPriceMinor: observation.observedPriceMinor,
        notes: observation.notes,
        evidence: {
          ...observation.evidence,
          watch: { id: watch.id, intervalMinutes: watch.interval_minutes, captureKind: "scheduled" },
        },
        capturedBy: "system:dropship-market-watch-worker",
        idempotencyKey,
        requestFingerprint,
      }, tx);

      // Persist every snapshot, but only emit a merchant-facing event for a material change.
      if (!research.replayed && change.changed) {
        await emitDomainEvent(tx, {
          merchantId: Number(watch.merchant_id),
          eventType: "dropship.market_research.observed",
          aggregateType: "dropship_market_watch",
          aggregateId: watch.id,
          actorType: "system",
          actorId: "dropship-market-watch-worker",
          source: "system",
          idempotencyKey: `market-watch:${watch.id}:${String(research.id)}:observed`,
          payload: {
            captureKind: "scheduled",
            watchId: watch.id,
            researchId: String(research.id),
            sourceKind: watch.source_kind,
            sourceDomain: captured.sourceDomain,
            evidenceStatus: "page_observed_not_checkout_verified",
            priceChanged: change.priceChanged,
            availabilityChanged: change.availabilityChanged,
            previousPriceMinor: change.previousPriceMinor,
            previousCurrency: change.previousCurrency,
            previousAvailability: change.previousAvailability,
            observedPriceMinor: change.currentPriceMinor,
            observedCurrency: change.currentCurrency,
            observedAvailability: change.currentAvailability,
          },
        });
      }

      await tx.execute(sql`
        UPDATE dropship_market_watches
        SET last_observation_id=${String(research.id)}::uuid,
            last_observed_title=${captured.title.slice(0, 500)},
            last_observed_currency=${observation.currency},
            last_observed_price_minor=${observation.observedPriceMinor},
            last_observed_availability=${captured.availability},
            last_checked_at=now(),next_capture_at=now()+(${watch.interval_minutes} * interval '1 minute'),
            last_error=NULL,consecutive_failures=0,capture_count=capture_count+1,
            claim_token=NULL,locked_at=NULL,updated_at=now()
        WHERE id=${watch.id}::uuid AND status='active' AND claim_token=${watch.claim_token}::uuid
      `);
    });
  } catch (error) {
    try {
      await recordWatchFailure(watch, error);
    } catch {
      // Leave the lease for bounded recovery if the database is temporarily unavailable.
      logger.warn({ watchId: watch.id }, "Could not persist scheduled market-watch failure state");
    }
  }
}

export async function runDropshipMarketWatchSweep(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (let index = 0; index < BATCH_SIZE; index += 1) {
      const watch = await claimNextWatch();
      if (!watch) break;
      await captureWatch(watch);
    }
  } finally {
    running = false;
  }
}

export function startDropshipMarketWatchWorker(): () => void {
  void runDropshipMarketWatchSweep().catch((error) => {
    logger.warn({ error: error instanceof Error ? error.message : "unknown" }, "Scheduled market-watch sweep failed");
  });
  const timer = setInterval(() => {
    void runDropshipMarketWatchSweep().catch((error) => {
      logger.warn({ error: error instanceof Error ? error.message : "unknown" }, "Scheduled market-watch sweep failed");
    });
  }, POLL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
