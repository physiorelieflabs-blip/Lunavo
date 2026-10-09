import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";
import { emitDomainEvent } from "./domain-events";
import { decryptSecret } from "./withdrawal-security";
import { ChannelGatewayError, channelGatewayConfigured, channelGatewayRequest } from "./channel-gateway-client";

const POLL_MS = 10_000;
const BATCH_SIZE = 4;
const MAX_ATTEMPTS = 5;
const LEASE_MINUTES = 15;
let running = false;
let warnedGatewayMissing = false;

type Direction = "pull" | "push";
type Resource = "products" | "inventory" | "pricing" | "orders" | "fulfillment" | "returns";
type SyncStatus = "succeeded" | "partial" | "failed";

type SyncJob = {
  id: string;
  connection_id: string;
  merchant_id: number;
  direction: Direction;
  resource: Resource;
  scope: string | null;
  status: string;
  idempotency_key: string;
  requested_by: string;
  correlation_id: string | null;
  attempts: number;
  metrics: Record<string, unknown> | null;
};

type ChannelConnection = {
  id: string;
  merchant_id: number;
  provider: string;
  display_name: string;
  status: string;
  store_url: string | null;
  external_account_ref: string | null;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  sync_products: boolean;
  sync_inventory: boolean;
  sync_orders: boolean;
  sync_fulfillment: boolean;
  sync_pricing: boolean;
  metadata: Record<string, unknown> | null;
};

type ChannelSyncResult = {
  status: "succeeded" | "partial";
  requestId: string;
  providerConfirmed: true;
  localCommitConfirmed: boolean;
  metrics: { read: number; created: number; updated: number; skipped: number; errors: number };
  nextCursor: string | null;
  message: string | null;
};

export function retryDelaySeconds(attempt: number): number {
  const bounded = Math.max(1, Math.min(20, Math.trunc(attempt) || 1));
  return Math.min(900, 15 * (2 ** (bounded - 1)));
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function metric(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) {
    throw new Error("Channel adapter returned invalid metrics");
  }
  return value;
}

/**
 * A remote provider acknowledgement alone is not sufficient for a successful pull.
 * The adapter must explicitly confirm its local transactional commit to Lunavo.
 */
export function assertChannelSyncResult(raw: unknown, direction: Direction): ChannelSyncResult {
  const value = object(raw);
  if (!value) throw new Error("Channel adapter returned an invalid response");
  if (value.status === "failed") {
    const message = typeof value.error === "string" ? value.error.slice(0, 500) : "Channel adapter reported failure";
    throw new ChannelGatewayError(message, value.retryable === true, typeof value.code === "string" ? value.code.slice(0, 80) : undefined);
  }
  if (value.status !== "succeeded" && value.status !== "partial") {
    throw new Error("Channel adapter must return succeeded, partial, or failed");
  }
  if (value.providerConfirmed !== true) throw new Error("Channel adapter did not confirm the provider operation");
  const requestId = typeof value.requestId === "string" ? value.requestId.trim().slice(0, 240) : "";
  if (!requestId) throw new Error("Channel adapter omitted the provider request ID");
  const localCommitConfirmed = value.localCommitConfirmed === true;
  if (direction === "pull" && !localCommitConfirmed) {
    throw new Error("Channel adapter did not confirm the localCommitConfirmed transaction");
  }
  const counts = object(value.metrics);
  if (!counts) throw new Error("Channel adapter omitted execution metrics");
  const nextCursor = typeof value.nextCursor === "string" ? value.nextCursor.slice(0, 4_000) : null;
  const message = typeof value.message === "string" ? value.message.slice(0, 500) : null;
  return {
    status: value.status,
    requestId,
    providerConfirmed: true,
    localCommitConfirmed,
    metrics: {
      read: metric(counts.read),
      created: metric(counts.created),
      updated: metric(counts.updated),
      skipped: metric(counts.skipped),
      errors: metric(counts.errors),
    },
    nextCursor,
    message,
  };
}

function connectionAllowsResource(connection: ChannelConnection, resource: Resource): boolean {
  switch (resource) {
    case "products": return connection.sync_products;
    case "inventory": return connection.sync_inventory;
    case "pricing": return connection.sync_pricing;
    case "orders": return connection.sync_orders;
    case "fulfillment": return connection.sync_fulfillment;
    case "returns": return true;
    default: return false;
  }
}

async function recoverExpiredLeases(): Promise<void> {
  await db.execute(sql`
    UPDATE merchant_channel_sync_jobs
    SET status = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'queued' END,
        locked_at = NULL,
        next_attempt_at = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN NULL ELSE now() + interval '15 seconds' END,
        last_error = COALESCE(last_error, 'Previous worker lease expired before completion'),
        updated_at = now()
    WHERE status = 'running'
      AND locked_at < now() - (${LEASE_MINUTES} * interval '1 minute')
  `);
}

async function claimNextJob(): Promise<SyncJob | null> {
  const result = await db.execute(sql`
    WITH candidate AS (
      SELECT id
      FROM merchant_channel_sync_jobs
      WHERE status = 'queued'
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE merchant_channel_sync_jobs AS job
    SET status = 'running',
        attempts = job.attempts + 1,
        locked_at = now(),
        started_at = now(),
        completed_at = NULL,
        last_error = NULL,
        updated_at = now()
    FROM candidate
    WHERE job.id = candidate.id
    RETURNING job.*
  `);
  return (result.rows[0] as SyncJob | undefined) ?? null;
}

async function loadConnection(job: SyncJob): Promise<ChannelConnection | null> {
  const result = await db.execute(sql`
    SELECT id, merchant_id, provider, display_name, status, store_url,
      external_account_ref, encrypted_access_token, encrypted_refresh_token,
      sync_products, sync_inventory, sync_orders, sync_fulfillment, sync_pricing, metadata
    FROM merchant_channel_connections
    WHERE id = ${job.connection_id}::uuid AND merchant_id = ${job.merchant_id}
    LIMIT 1
  `);
  return (result.rows[0] as ChannelConnection | undefined) ?? null;
}

async function priorCursor(job: SyncJob): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT metrics->>'nextCursor' AS cursor
    FROM merchant_channel_sync_jobs
    WHERE connection_id = ${job.connection_id}::uuid
      AND merchant_id = ${job.merchant_id}
      AND direction = ${job.direction}
      AND resource = ${job.resource}
      AND status IN ('succeeded','partial')
      AND metrics ? 'nextCursor'
    ORDER BY completed_at DESC NULLS LAST
    LIMIT 1
  `);
  const cursor = result.rows[0] && (result.rows[0] as { cursor?: unknown }).cursor;
  return typeof cursor === "string" && cursor ? cursor.slice(0, 4_000) : null;
}

async function finishWithoutRetry(job: SyncJob, status: "failed" | "cancelled", reason: string): Promise<void> {
  const updated = await db.execute(sql`
    UPDATE merchant_channel_sync_jobs
    SET status = ${status}, locked_at = NULL, completed_at = now(),
        last_error = ${reason.slice(0, 1_000)}, updated_at = now()
    WHERE id = ${job.id}::uuid AND merchant_id = ${job.merchant_id}
      AND status = 'running' AND attempts = ${job.attempts}
    RETURNING id
  `);
  if (!updated.rows.length) return; // The lease was reclaimed; a stale worker may not emit events.
  await emitDomainEvent(db, {
    merchantId: job.merchant_id,
    eventType: status === "failed" ? "channel.sync.failed" : "channel.sync.cancelled",
    aggregateType: "channel_sync_job",
    aggregateId: job.id,
    actorType: "system",
    source: "system",
    idempotencyKey: `channel-sync:${job.id}:${status}:${job.attempts}`,
    payload: { jobId: job.id, direction: job.direction, resource: job.resource, status, reason: reason.slice(0, 500), attempt: job.attempts },
  });
}

async function retryOrFail(job: SyncJob, error: unknown): Promise<void> {
  const retryable = error instanceof ChannelGatewayError ? error.retryable : true;
  const message = (error instanceof Error ? error.message : "Channel sync failed").slice(0, 1_000);
  const terminal = !retryable || job.attempts >= MAX_ATTEMPTS;
  const delay = retryDelaySeconds(job.attempts);
  await db.execute(sql`
    UPDATE merchant_channel_sync_jobs
    SET status = ${terminal ? "failed" : "queued"},
        locked_at = NULL,
        completed_at = CASE WHEN ${terminal} THEN now() ELSE NULL END,
        next_attempt_at = CASE WHEN ${terminal} THEN NULL ELSE now() + (${delay} * interval '1 second') END,
        last_error = ${message},
        updated_at = now()
    WHERE id = ${job.id}::uuid AND merchant_id = ${job.merchant_id}
      AND status = 'running' AND attempts = ${job.attempts}
    RETURNING id
  `);
  if (terminal) {
    await emitDomainEvent(db, {
      merchantId: job.merchant_id,
      eventType: "channel.sync.failed",
      aggregateType: "channel_sync_job",
      aggregateId: job.id,
      actorType: "system",
      source: "system",
      idempotencyKey: `channel-sync:${job.id}:failed:${job.attempts}`,
      payload: { jobId: job.id, direction: job.direction, resource: job.resource, status: "failed", reason: message.slice(0, 500), attempt: job.attempts },
    });
  }
}

async function processJob(job: SyncJob): Promise<void> {
  const connection = await loadConnection(job);
  if (!connection) {
    await finishWithoutRetry(job, "failed", "Channel connection was deleted or is outside the job tenant");
    return;
  }
  if (connection.status === "revoked" || connection.status === "paused") {
    await finishWithoutRetry(job, "cancelled", "Channel connection is paused or revoked");
    return;
  }
  if (connection.status !== "connected" && connection.status !== "degraded") {
    await finishWithoutRetry(job, "failed", "Connect and verify this channel before running sync jobs");
    return;
  }
  if (!connectionAllowsResource(connection, job.resource)) {
    await finishWithoutRetry(job, "cancelled", "This resource is disabled for the channel connection");
    return;
  }

  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  try {
    accessToken = connection.encrypted_access_token ? decryptSecret(connection.encrypted_access_token) : null;
    refreshToken = connection.encrypted_refresh_token ? decryptSecret(connection.encrypted_refresh_token) : null;
  } catch {
    throw new ChannelGatewayError("Stored channel credentials could not be decrypted. Reconnect the channel.", false, "credential_decryption_failed");
  }

  const cursor = await priorCursor(job);
  const payload = {
    connection: {
      id: connection.id,
      merchantId: connection.merchant_id,
      provider: connection.provider,
      displayName: connection.display_name,
      storeUrl: connection.store_url,
      externalAccountRef: connection.external_account_ref,
      accessToken,
      refreshToken,
      metadata: connection.metadata ?? {},
    },
    job: {
      id: job.id,
      merchantId: job.merchant_id,
      direction: job.direction,
      resource: job.resource,
      scope: job.scope,
      idempotencyKey: job.idempotency_key,
      correlationId: job.correlation_id,
      cursor,
      attempt: job.attempts,
    },
  };

  const raw = await channelGatewayRequest<unknown>("sync.execute", payload);
  const result = assertChannelSyncResult(raw, job.direction);
  const status = result.status;
  const safeMetrics = {
    ...result.metrics,
    requestId: result.requestId,
    ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
    ...(result.message ? { message: result.message } : {}),
    providerConfirmed: result.providerConfirmed,
    localCommitConfirmed: result.localCommitConfirmed,
  };
  const lastError = status === "partial" ? (result.message ?? "Adapter reported a partial sync") : null;
  const persisted = await db.execute(sql`
    UPDATE merchant_channel_sync_jobs
    SET status = ${status},
        metrics = ${JSON.stringify(safeMetrics)}::jsonb,
        locked_at = NULL,
        completed_at = now(),
        next_attempt_at = NULL,
        last_error = ${lastError},
        updated_at = now()
    WHERE id = ${job.id}::uuid AND merchant_id = ${job.merchant_id}
      AND status = 'running' AND attempts = ${job.attempts}
    RETURNING id
  `);
  if (!persisted.rows.length) return; // A stale worker must not overwrite newer sync state.
  await db.execute(sql`
    UPDATE merchant_channel_connections
    SET status = ${status === "partial" ? "degraded" : "connected"},
        last_error = ${lastError},
        last_product_sync_at = CASE WHEN ${job.resource === "products"} THEN now() ELSE last_product_sync_at END,
        last_inventory_sync_at = CASE WHEN ${job.resource === "inventory"} THEN now() ELSE last_inventory_sync_at END,
        last_order_sync_at = CASE WHEN ${job.resource === "orders"} THEN now() ELSE last_order_sync_at END,
        last_fulfillment_sync_at = CASE WHEN ${job.resource === "fulfillment"} THEN now() ELSE last_fulfillment_sync_at END,
        updated_at = now()
    WHERE id = ${connection.id}::uuid AND merchant_id = ${job.merchant_id}
  `);
  await emitDomainEvent(db, {
    merchantId: job.merchant_id,
    eventType: status === "succeeded" ? "channel.sync.completed" : "channel.sync.partial",
    aggregateType: "channel_sync_job",
    aggregateId: job.id,
    actorType: "system",
    source: "system",
    idempotencyKey: `channel-sync:${job.id}:${status}:${job.attempts}`,
    payload: { jobId: job.id, direction: job.direction, resource: job.resource, status, provider: connection.provider, metrics: result.metrics, requestId: result.requestId },
  });
  logger.info({ jobId: job.id, merchantId: job.merchant_id, provider: connection.provider, resource: job.resource, direction: job.direction, status, metrics: result.metrics }, "Channel sync job completed");
}

export async function runChannelSyncSweep(): Promise<void> {
  if (running) return;
  if (!channelGatewayConfigured()) {
    if (!warnedGatewayMissing) {
      logger.warn("Channel jobs are held in the durable queue until the private self-hosted channel adapter gateway is configured");
      warnedGatewayMissing = true;
    }
    return;
  }
  warnedGatewayMissing = false;
  running = true;
  try {
    await recoverExpiredLeases();
    for (let count = 0; count < BATCH_SIZE; count += 1) {
      const job = await claimNextJob();
      if (!job) break;
      try {
        await processJob(job);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Channel sync failed";
        await retryOrFail(job, error);
        logger.warn({ jobId: job.id, merchantId: job.merchant_id, attempts: job.attempts, error: message.slice(0, 500) }, "Channel sync job did not complete");
      }
    }
  } finally {
    running = false;
  }
}

export function startChannelSyncWorker(): () => void {
  void runChannelSyncSweep();
  const timer = setInterval(() => void runChannelSyncSweep(), POLL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
