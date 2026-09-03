import { randomUUID } from "node:crypto";
import { and, eq, lte, sql } from "drizzle-orm";
import {
  db,
  domainEventConsumptionsTable,
  domainEventsTable,
  notificationsTable,
} from "@workspace/db";
import { logger } from "./logger";

/**
 * Only facts emitted by authoritative commerce mutations belong here. Adding a
 * name is an intentional contract change; consumers must remain compatible
 * with previous payload versions.
 */
export const domainEventTypes = [
  "order.created", "order.cancelled", "payment.verified", "refund.processed",
  "invoice.sent", "invoice.payment_submitted", "invoice.payment_verified",
  "inventory.adjusted", "inventory.reserved", "inventory.released", "inventory.committed",
  "marketplace.listing_reviewed", "marketplace.fee_reviewed",
  "advertising.payment_submitted", "advertising.payment_confirmed",
  "advertising.payment_reviewed",
  "ai.action_proposed", "ai.action_approved", "ai.action_executed",
  "ai.action_rejected", "ai.action_rolled_back",
  "location.created", "location.updated", "location.disabled",
  "ts_pay.transfer_completed", "ts_pay.transfer_received",
  "invitation.created", "invitation.revoked", "invitation.accepted",
  "membership.role_changed", "membership.scope_changed", "membership.status_changed",
] as const;
export type DomainEventType = (typeof domainEventTypes)[number];

type EventExecutor = Pick<typeof db, "insert" | "select">;
export type EmitDomainEventInput = {
  merchantId: number;
  eventType: DomainEventType;
  aggregateType: string;
  aggregateId: string | number;
  actorType: "merchant" | "staff" | "customer" | "admin" | "system" | "ai";
  actorId?: string | null;
  source: "merchant_api" | "public_checkout" | "admin_api" | "system" | "ai";
  idempotencyKey: string;
  payload: Record<string, unknown>;
  payloadVersion?: number;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  context?: Record<string, unknown>;
  correlationId?: string | null;
  causationId?: string | null;
};

/** Use the same Drizzle transaction as the state mutation. */
export async function emitDomainEvent(executor: EventExecutor, input: EmitDomainEventInput) {
  if (!Number.isInteger(input.merchantId) || input.merchantId <= 0) {
    throw new Error("Domain events require a valid tenant merchantId");
  }
  if (!input.idempotencyKey.trim() || !input.aggregateType.trim() || !String(input.aggregateId).trim()) {
    throw new Error("Domain events require aggregate and idempotency identifiers");
  }
  const id = randomUUID();
  const [inserted] = await executor.insert(domainEventsTable).values({
    id, merchantId: input.merchantId, eventType: input.eventType,
    payloadVersion: input.payloadVersion ?? 1, aggregateType: input.aggregateType,
    aggregateId: String(input.aggregateId), actorType: input.actorType,
    actorId: input.actorId ?? null, source: input.source, idempotencyKey: input.idempotencyKey,
    payload: input.payload, before: input.before ?? null, after: input.after ?? null,
    context: input.context ?? {}, correlationId: input.correlationId ?? null,
    causationId: input.causationId ?? null,
  }).onConflictDoNothing().returning();
  if (inserted) return inserted;
  const [existing] = await executor.select().from(domainEventsTable).where(and(
    eq(domainEventsTable.merchantId, input.merchantId),
    eq(domainEventsTable.idempotencyKey, input.idempotencyKey),
  )).limit(1);
  if (!existing) throw new Error("Domain event idempotency conflict could not be resolved");
  return existing;
}

export function retryDelayMs(attempt: number): number {
  return Math.min(60 * 60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
}
export function nextEventState(attempt: number, maxAttempts = 8): "retry" | "dead_letter" {
  return attempt >= maxAttempts ? "dead_letter" : "retry";
}
export function safeProjectionError(_error: unknown): { code: string; message: string } {
  // Database/provider errors can contain SQL, identifiers, and customer data.
  // Merchant-facing history receives only this stable, non-sensitive contract.
  return { code: "projection_failed", message: "A notification projection could not be completed." };
}

function notificationFor(event: typeof domainEventsTable.$inferSelect) {
  const links: Record<string, string> = {
    order: "/orders", invoice: "/invoices", inventory: "/inventory",
    marketplace_listing: "/marketplace/manage", ai_action: "/ai",
    location: "/settings/team", invitation: "/settings/team", membership: "/settings/team",
  };
  const labels: Partial<Record<DomainEventType, [string, string, string]>> = {
    "order.created": ["New order recorded", "An order was created.", "info"],
    "order.cancelled": ["Order cancelled", "A pending order was cancelled.", "warning"],
    "payment.verified": ["Payment verified", "Verified payment was posted to the authoritative ledger.", "success"],
    "refund.processed": ["Refund processed", "A refund was processed against a verified payment.", "warning"],
    "invoice.sent": ["Invoice sent", "An invoice is now available to the customer.", "info"],
    "invoice.payment_submitted": ["Invoice payment submitted", "Customer payment evidence is awaiting review.", "warning"],
    "invoice.payment_verified": ["Invoice payment verified", "Invoice payment was verified and posted.", "success"],
    "inventory.adjusted": ["Inventory adjusted", "An inventory movement was recorded.", "info"],
    "inventory.reserved": ["Inventory reserved", "Stock is held pending payment verification.", "info"],
    "inventory.released": ["Inventory reservation released", "A pending stock hold was released.", "warning"],
    "inventory.committed": ["Inventory committed", "Reserved stock was committed after verified payment.", "success"],
    "location.created": ["Location added", "A new merchant location was created.", "info"],
    "location.updated": ["Location updated", "A merchant location was updated.", "info"],
    "location.disabled": ["Location disabled", "A merchant location was disabled.", "warning"],
    "invitation.created": ["Team invitation created", "A staff invitation is ready to share.", "info"],
    "invitation.revoked": ["Team invitation revoked", "A staff invitation was revoked.", "warning"],
    "invitation.accepted": ["Team invitation accepted", "A staff member joined the workspace.", "success"],
    "membership.role_changed": ["Staff role updated", "A staff member's role changed.", "info"],
    "membership.scope_changed": ["Staff location access updated", "A staff member's location access changed.", "info"],
    "membership.status_changed": ["Staff access updated", "A staff member's access status changed.", "warning"],
    "ts_pay.transfer_completed": ["TS Pay transfer sent", "An internal TS Pay transfer was completed.", "info"],
    "ts_pay.transfer_received": ["TS Pay transfer received", "An internal TS Pay transfer was received.", "success"],
  };
  const label = labels[event.eventType as DomainEventType];
  if (!label) return null;
  return { title: label[0], body: label[1], severity: label[2], deepLink: links[event.aggregateType] ?? null };
}

async function projectNotification(tx: Pick<typeof db, "insert">, event: typeof domainEventsTable.$inferSelect) {
  const detail = notificationFor(event);
  if (!detail) return;
  await tx.insert(notificationsTable).values({
    id: randomUUID(), merchantId: event.merchantId, eventId: event.id,
    recipientType: "merchant", actorType: event.actorType, actorId: event.actorId,
    entityType: event.aggregateType, entityId: event.aggregateId,
    title: detail.title, body: detail.body, severity: detail.severity,
    deepLink: detail.deepLink, actionLabel: detail.deepLink ? "Open record" : null,
    dedupeKey: `event:${event.id}:notification`,
  }).onConflictDoNothing();
}

/** Processes projections only. It never replays or invokes authoritative mutations. */
async function claimNextDomainEvent() {
  return db.transaction(async (tx) => {
    // A crashed replica leaves a lease, rather than a permanent processing
    // state. This transition is safe because processing is idempotent.
    await tx.update(domainEventsTable).set({ status: "retry" })
      .where(and(eq(domainEventsTable.status, "processing"), lte(domainEventsTable.nextAttemptAt, new Date())));
    const result = await tx.execute(sql<typeof domainEventsTable.$inferSelect>`
      SELECT * FROM domain_events
      WHERE status IN ('pending', 'retry') AND next_attempt_at <= now()
      ORDER BY occurred_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);
    const event = result.rows[0] as typeof domainEventsTable.$inferSelect | undefined;
    if (!event) return null;
    const [claimed] = await tx.update(domainEventsTable).set({ status: "processing", attempts: event.attempts + 1, nextAttemptAt: new Date(Date.now() + 5 * 60_000) })
      .where(and(eq(domainEventsTable.id, event.id), eq(domainEventsTable.status, event.status))).returning();
    return claimed ?? null;
  });
}

async function processClaimedDomainEvent(event: typeof domainEventsTable.$inferSelect) {
  try {
    await db.transaction(async (tx) => {
      const current = (await tx.select().from(domainEventsTable)
        .where(and(eq(domainEventsTable.id, event.id), eq(domainEventsTable.status, "processing"))).limit(1))[0];
      if (!current) return;
      const [receipt] = await tx.insert(domainEventConsumptionsTable)
          .values({ eventId: event.id, consumer: "merchant_notification_projection" })
          .onConflictDoNothing().returning();
      if (receipt) await projectNotification(tx, current);
      await tx.update(domainEventsTable).set({ status: "processed", processedAt: new Date(), lastError: null })
        .where(and(eq(domainEventsTable.id, event.id), eq(domainEventsTable.status, "processing")));
    });
  } catch (error) {
    const safe = safeProjectionError(error);
    const state = nextEventState(event.attempts);
    // This is a new transaction: the projection transaction has rolled back
    // and cannot poison the durable retry/dead-letter update.
    await db.transaction(async (tx) => {
      await tx.update(domainEventsTable).set({
        status: state, lastError: `${safe.code}: ${safe.message}`,
        nextAttemptAt: new Date(Date.now() + retryDelayMs(event.attempts)),
      }).where(and(eq(domainEventsTable.id, event.id), eq(domainEventsTable.status, "processing")));
    });
    logger.error({ err: error, eventId: event.id, merchantId: event.merchantId, eventType: event.eventType, attempts: event.attempts, state }, "Domain event projection failed");
  }
}

export async function processDomainEventOutbox(limit = 25) {
  let processed = 0;
  for (let index = 0; index < Math.max(1, Math.min(limit, 100)); index += 1) {
    const event = await claimNextDomainEvent();
    if (!event) break;
    await processClaimedDomainEvent(event);
    processed += 1;
  }
  if (processed) logger.info({ count: processed }, "Domain event outbox batch processed");
  return processed;
}

export function startDomainEventOutbox(intervalMs = 10_000) {
  const timer = setInterval(() => {
    void processDomainEventOutbox().catch((err: unknown) => logger.error({ err }, "Domain event outbox batch crashed"));
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}