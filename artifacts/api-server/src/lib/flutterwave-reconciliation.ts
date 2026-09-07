import { and, eq, gte, inArray, or } from "drizzle-orm";
import { db, paymentIntentsTable, paymentsTable } from "@workspace/db";
import {
  findFlutterwaveTransactionsByReference,
  isFlutterwaveConfigured,
  verifyFlutterwaveTransaction,
  flutterwaveStatus,
} from "./flutterwave-client";
import { processVerifiedFlutterwaveTransaction } from "../routes/flutterwave-payment-processor";

const INTERVAL_MS = 60 * 60 * 1000;
const MIN_AGE_MS = 60 * 1000;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const BATCH_SIZE = 25;

function yyyyMmDd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

let running = false;

export async function reconcilePendingFlutterwavePayments() {
  if (running || !isFlutterwaveConfigured()) return;
  running = true;
  try {
    const now = Date.now();
    const newest = new Date(now - MIN_AGE_MS);
    const oldest = new Date(now - MAX_AGE_MS);

    const [intents, subscriptionPayments] = await Promise.all([
      db
        .select()
        .from(paymentIntentsTable)
        .where(and(
          inArray(paymentIntentsTable.status, ["created", "awaiting_payment", "pending", "processing", "provider_confirmed"]),
          gte(paymentIntentsTable.createdAt, oldest),
        ))
        .limit(BATCH_SIZE),
      db
        .select()
        .from(paymentsTable)
        .where(and(
          eq(paymentsTable.method, "flutterwave"),
          inArray(paymentsTable.status, ["pending", "under_review"]),
          gte(paymentsTable.createdAt, oldest),
        ))
        .limit(BATCH_SIZE),
    ]);

    const seenReferences = new Set<string>();
    const references: Array<{ reference: string; paymentIntentId?: number; paymentId?: number }> = [];

    for (const intent of intents) {
      const reference = intent.evidenceReference?.trim() || intent.idempotencyKey?.trim() || "";
      if (!reference || seenReferences.has(reference) || intent.createdAt > newest) continue;
      seenReferences.add(reference);
      references.push({ reference, paymentIntentId: intent.id });
    }

    for (const payment of subscriptionPayments) {
      const reference = payment.evidenceReference?.trim() || payment.reference.trim();
      if (!reference || seenReferences.has(reference) || payment.createdAt > newest) continue;
      seenReferences.add(reference);
      references.push({ reference, paymentId: payment.id });
    }

    for (const item of references.slice(0, BATCH_SIZE)) {
      try {
        const transactions = await findFlutterwaveTransactionsByReference(
          item.reference,
          yyyyMmDd(oldest),
          yyyyMmDd(newest),
        );
        for (const candidate of transactions.slice(0, 3)) {
          const providerId = candidate.id == null ? "" : String(candidate.id);
          if (!providerId) continue;
          const status = flutterwaveStatus(candidate);
          if (status === "pending") continue;

          // Re-query the exact transaction before value is granted.
          const verified = await verifyFlutterwaveTransaction(providerId);
          await processVerifiedFlutterwaveTransaction(
            verified as unknown as Record<string, unknown>,
            `reconciliation:${providerId}`,
            { source: "pending_payment_reconciliation", reference: item.reference },
          );
        }
      } catch {
        // A transient provider failure is deliberately non-authoritative.
        // The next scheduled pass will retry without changing financial state.
      }
    }
  } finally {
    running = false;
  }
}

export function startPendingFlutterwaveReconciliation() {
  void reconcilePendingFlutterwavePayments();
  const timer = setInterval(() => {
    void reconcilePendingFlutterwavePayments();
  }, INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
