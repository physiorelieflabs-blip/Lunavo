import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { createHash } from "crypto";

/**
 * Idempotent payment request handling.
 * Ensures that duplicate requests (network retries, etc.) do not create
 * duplicate payment sessions or duplicate financial effects.
 */
export async function getOrCreatePaymentSession(
  storeId: string,
  customerId: string,
  orderId: string,
  amount: number,
  currency: string,
  idempotencyKey: string
): Promise<{ sessionId: string; isNew: boolean }> {
  // Hash the idempotency key to normalize
  const keyHash = createHash("sha256").update(idempotencyKey).digest("hex");

  // Check if a session already exists for this idempotency key
  const existing = await db.execute(sql`
    SELECT id FROM payment_sessions
    WHERE store_id = ${storeId}
    AND idempotency_key_hash = ${keyHash}
    LIMIT 1
  `);

  if (existing.rows.length > 0) {
    const row = existing.rows[0] as { id: string };
    return { sessionId: row.id, isNew: false };
  }

  // Create a new session
  const sessionId = crypto.randomUUID();
  const now = new Date();

  await db.execute(sql`
    INSERT INTO payment_sessions (
      id, store_id, customer_id, order_id, amount, currency,
      status, idempotency_key_hash, created_at, updated_at
    ) VALUES (
      ${sessionId}, ${storeId}, ${customerId}, ${orderId},
      ${amount}, ${currency}, 'created', ${keyHash}, ${now}, ${now}
    )
  `);

  return { sessionId, isNew: true };
}

/**
 * Record a webhook event with idempotency to prevent duplicate processing.
 */
export async function recordWebhookEvent(
  provider: string,
  eventId: string,
  rawPayload: unknown
): Promise<{ recorded: boolean; existingProcessedAt?: Date }> {
  // Check if this webhook has already been processed
  const existing = await db.execute(sql`
    SELECT processed_at FROM webhook_events
    WHERE provider = ${provider}
    AND event_id = ${eventId}
    LIMIT 1
  `);

  if (existing.rows.length > 0) {
    const row = existing.rows[0] as { processed_at: Date };
    return { recorded: false, existingProcessedAt: row.processed_at };
  }

  // Insert new webhook event record
  const now = new Date();
  await db.execute(sql`
    INSERT INTO webhook_events (
      provider, event_id, payload, received_at, processed_at
    ) VALUES (
      ${provider}, ${eventId}, ${JSON.stringify(rawPayload)}, ${now}, ${now}
    )
  `);

  return { recorded: true };
}

/**
 * Mark a webhook as successfully processed.
 */
export async function markWebhookProcessed(
  provider: string,
  eventId: string
): Promise<void> {
  await db.execute(sql`
    UPDATE webhook_events
    SET status = 'processed', updated_at = now()
    WHERE provider = ${provider}
    AND event_id = ${eventId}
  `);
}
