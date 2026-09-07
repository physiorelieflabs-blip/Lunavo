import { Router, type Request, type Response } from "express";
import { and, eq, or, sql } from "drizzle-orm";
import {
  db,
  activityTable,
  commerceTransitionHistoryTable,
  customersTable,
  ledgerEntriesTable,
  merchantsTable,
  ordersTable,
  paymentIntentsTable,
  paymentRecordsTable,
  paymentWebhookEventsTable,
  subscriptionsTable,
} from "@workspace/db";
import {
  flutterwaveAmount,
  flutterwaveStatus,
  flutterwaveTransactionId,
  verifyFlutterwaveTransaction,
  verifyFlutterwaveWebhookSignature,
} from "../lib/flutterwave-client";
import {
  ensureReferralPeriodForPaidSubscription,
  qualifyReferralForPayment,
  reverseReferralReward,
} from "../lib/referrals";

const router = Router();

function rawBody(req: Request): Buffer | null {
  return Buffer.isBuffer(req.body) ? req.body : null;
}

function eventIdFrom(req: Request, payload: Record<string, unknown>): string | null {
  const headerCandidates = [
    req.header("flutterwave-event-id"),
    req.header("x-flutterwave-event-id"),
    req.header("webhook-id"),
    req.header("x-webhook-id"),
  ];
  for (const value of headerCandidates) {
    if (value?.trim()) return value.trim();
  }
  for (const key of ["event_id", "eventId", "id", "webhook_id", "webhookId"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function webhookData(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload.data;
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : payload;
}

function transactionCustomerEmail(transaction: Record<string, unknown>): string | null {
  const customer = transaction.customer;
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) return null;
  const email = (customer as Record<string, unknown>).email;
  return typeof email === "string" ? email.trim().toLowerCase() : null;
}

function txRef(transaction: Record<string, unknown>): string {
  return typeof transaction.tx_ref === "string" ? transaction.tx_ref.trim() : "";
}

async function recordException(input: {
  eventId: string;
  providerTransactionId?: string | null;
  paymentReference?: string | null;
  merchantId?: number | null;
  orderId?: number | null;
  paymentIntentId?: number | null;
  expectedAmountMinor?: number | null;
  observedAmountMinor?: number | null;
  expectedCurrency?: string | null;
  observedCurrency?: string | null;
  reason: string;
  payload: Record<string, unknown>;
}) {
  await db.execute(sql`
    INSERT INTO payment_reconciliation_exceptions
      (provider, event_id, provider_transaction_id, payment_reference, merchant_id, order_id,
       payment_intent_id, expected_amount_minor, observed_amount_minor, expected_currency,
       observed_currency, reason, raw_payload)
    VALUES
      ('flutterwave', ${input.eventId}, ${input.providerTransactionId ?? null}, ${input.paymentReference ?? null},
       ${input.merchantId ?? null}, ${input.orderId ?? null}, ${input.paymentIntentId ?? null},
       ${input.expectedAmountMinor ?? null}, ${input.observedAmountMinor ?? null},
       ${input.expectedCurrency ?? null}, ${input.observedCurrency ?? null}, ${input.reason},
       ${JSON.stringify(input.payload)}::jsonb)
    ON CONFLICT (provider, event_id) DO NOTHING
  `);
}

async function processVerifiedTransaction(
  transaction: Record<string, unknown>,
  eventId: string,
  rawPayload: Record<string, unknown>,
) {
  const providerId = flutterwaveTransactionId(transaction as any);
  const reference = txRef(transaction);
  const providerState = flutterwaveStatus(transaction as any);
  const amount = flutterwaveAmount(transaction as any);
  const currency = String(transaction.currency ?? "").trim().toUpperCase();

  let intent = reference
    ? (await db.select().from(paymentIntentsTable).where(or(
        eq(paymentIntentsTable.evidenceReference, reference),
        eq(paymentIntentsTable.idempotencyKey, reference),
      )).limit(1))[0]
    : undefined;

  let legacyPayment = reference
    ? (await db.select().from(paymentRecordsTable).where(eq(paymentRecordsTable.evidenceReference, reference)).limit(1))[0]
    : undefined;

  const flutterwavePayment = reference
    ? (await db.select().from(paymentRecordsTable).where(and(
        eq(paymentRecordsTable.method, "flutterwave"),
        or(eq(paymentRecordsTable.evidenceReference, reference), eq(paymentRecordsTable.status, "processing")),
      )).limit(1))[0]
    : undefined;
  legacyPayment = legacyPayment ?? flutterwavePayment;

  if (!intent && reference) {
    const payment = (await db.select().from(paymentRecordsTable).where(and(
      eq(paymentRecordsTable.method, "flutterwave"),
      eq(paymentRecordsTable.evidenceReference, reference),
    )).limit(1))[0];
    if (payment) {
      intent = (await db.select().from(paymentIntentsTable).where(eq(paymentIntentsTable.id, payment.intentId)).limit(1))[0];
    }
  }

  const merchantId = intent?.merchantId ?? legacyPayment?.merchantId ?? null;
  const orderId = intent?.orderId ?? legacyPayment?.orderId ?? null;

  if (!intent && !legacyPayment) {
    await recordException({
      eventId,
      providerTransactionId: providerId,
      paymentReference: reference || null,
      observedAmountMinor: Number.isFinite(amount) ? Math.round(amount * 100) : null,
      observedCurrency: currency || null,
      reason: "Flutterwave transaction has no matching TS Pay payment session",
      payload: rawPayload,
    });
    return { outcome: "reconciliation_required" as const };
  }

  if (providerState === "pending") {
    await db.transaction(async (tx) => {
      if (intent) {
        await tx.update(paymentIntentsTable).set({ status: "pending", evidenceReference: reference || intent.evidenceReference }).where(eq(paymentIntentsTable.id, intent.id));
        await tx.update(paymentRecordsTable).set({ status: "pending", evidenceReference: reference || undefined }).where(eq(paymentRecordsTable.intentId, intent.id));
      }
    });
    return { outcome: "pending" as const };
  }

  const transactionEmail = transactionCustomerEmail(transaction);
  if (intent && orderId !== null) {
    const [order] = await db.select().from(ordersTable).where(and(eq(ordersTable.id, orderId), eq(ordersTable.merchantId, intent.merchantId))).limit(1);
    const [customer] = order
      ? await db.select().from(customersTable).where(and(eq(customersTable.id, order.customerId), eq(customersTable.merchantId, intent.merchantId))).limit(1)
      : [];
    const expectedAmountMinor = intent.amountMinor;
    const expectedCurrency = intent.currency.toUpperCase();
    const merchant = (await db.select().from(merchantsTable).where(eq(merchantsTable.id, intent.merchantId)).limit(1))[0];

    if (!order || !customer || !merchant) {
      await recordException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: intent.merchantId, orderId, paymentIntentId: intent.id, reason: "Payment session references missing tenant records", payload: rawPayload });
      return { outcome: "reconciliation_required" as const };
    }
    if (providerState === "failed") {
      await db.transaction(async (tx) => {
        await tx.update(paymentIntentsTable).set({ status: "failed", evidenceReference: reference || intent.evidenceReference }).where(eq(paymentIntentsTable.id, intent.id));
        await tx.update(paymentRecordsTable).set({ status: "failed", evidenceReference: reference || undefined }).where(eq(paymentRecordsTable.intentId, intent.id));
      });
      return { outcome: "failed" as const };
    }
    if (!Number.isFinite(amount) || Math.round(amount * 100) !== expectedAmountMinor || currency !== expectedCurrency) {
      await recordException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: intent.merchantId, orderId, paymentIntentId: intent.id, expectedAmountMinor, observedAmountMinor: Number.isFinite(amount) ? Math.round(amount * 100) : null, expectedCurrency, observedCurrency: currency || null, reason: "Verified Flutterwave amount or currency does not match the payment session", payload: rawPayload });
      await db.update(paymentIntentsTable).set({ status: "reconciliation_required" }).where(eq(paymentIntentsTable.id, intent.id));
      return { outcome: "reconciliation_required" as const };
    }
    if (reference && intent.evidenceReference && reference !== intent.evidenceReference) {
      await recordException({ eventId, providerTransactionId: providerId, paymentReference: reference, merchantId: intent.merchantId, orderId, paymentIntentId: intent.id, reason: "Flutterwave reference does not match the payment session", payload: rawPayload });
      await db.update(paymentIntentsTable).set({ status: "reconciliation_required" }).where(eq(paymentIntentsTable.id, intent.id));
      return { outcome: "reconciliation_required" as const };
    }
    if (transactionEmail && transactionEmail !== customer.email.trim().toLowerCase()) {
      await recordException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: intent.merchantId, orderId, paymentIntentId: intent.id, reason: "Flutterwave customer email does not match the TS Commerce customer", payload: rawPayload });
      await db.update(paymentIntentsTable).set({ status: "reconciliation_required" }).where(eq(paymentIntentsTable.id, intent.id));
      return { outcome: "reconciliation_required" as const };
    }

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from ${ordersTable} where id=${order.id} and merchant_id=${merchant.id} for update`);
      await tx.execute(sql`select id from ${payment_intents} where id=${intent!.id} for update`);
      const currentIntent = (await tx.select().from(paymentIntentsTable).where(eq(paymentIntentsTable.id, intent!.id)).limit(1))[0];
      const currentRecord = (await tx.select().from(paymentRecordsTable).where(eq(paymentRecordsTable.intentId, intent!.id)).limit(1))[0];
      if (!currentIntent || !currentRecord) throw new Error("TS Pay payment records disappeared during webhook processing");
      if (["successful", "verified"].includes(currentIntent.status)) return { status: "already_successful" as const };
      const providerTransactionReference = providerId ?? reference;
      const providerAmountMinor = Math.round(amount * 100);
      await tx.update(paymentIntentsTable).set({ status: "successful", evidenceReference: providerTransactionReference, settlementAmountMinor: providerAmountMinor, settlementCurrency: currency }).where(and(eq(paymentIntentsTable.id, currentIntent.id), eq(paymentIntentsTable.status, currentIntent.status)));
      await tx.update(paymentRecordsTable).set({ status: "successful", evidenceReference: providerTransactionReference, verifiedBy: "flutterwave_webhook", verifiedAt: new Date() }).where(and(eq(paymentRecordsTable.id, currentRecord.id), eq(paymentRecordsTable.status, currentRecord.status)));
      await tx.insert(ledgerEntriesTable).values({ merchantId: merchant.id, orderId: order.id, paymentRecordId: currentRecord.id, amountMinor: providerAmountMinor, currency, entryType: "sale", referenceKey: `payment:${currentIntent.id}` }).onConflictDoNothing({ target: ledgerEntriesTable.referenceKey });
      await tx.update(ordersTable).set({ status: "paid" }).where(and(eq(ordersTable.id, order.id), eq(ordersTable.merchantId, merchant.id), eq(ordersTable.status, "pending")));
      await tx.insert(commerceTransitionHistoryTable).values({ merchantId: merchant.id, orderId: order.id, paymentIntentId: currentIntent.id, entityType: "payment_intent", fromStatus: currentIntent.status, toStatus: "successful", actorId: "flutterwave_webhook", note: "Provider-verified payment" });
      await tx.insert(activityTable).values({ merchantId: merchant.id, type: "payment_verified", title: "Payment verified", description: "Flutterwave provider evidence was verified server-side and the order was marked paid.", amount: (providerAmountMinor / 100).toFixed(2), currency, tone: "positive" });
      return { status: "successful" as const };
    });
    return { outcome: result.status === "already_successful" ? "duplicate" as const : "successful" as const };
  }

  // Subscription payments use the existing payments/subscriptions model.
  if (legacyPayment) {
    const merchant = (await db.select().from(merchantsTable).where(eq(merchantsTable.id, legacyPayment.merchantId)).limit(1))[0];
    const subscription = merchant
      ? (await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.merchantId, merchant.id)).limit(1))[0]
      : undefined;
    if (!merchant || !subscription) {
      await recordException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: legacyPayment.merchantId, reason: "Subscription payment is not linked to a merchant subscription", payload: rawPayload });
      return { outcome: "reconciliation_required" as const };
    }
    const expectedMinor = Math.round(Number(legacyPayment.amount) * 100);
    if (providerState !== "paid") {
      await db.update(legacyPayment.id ? paymentsTable : subscriptionsTable).set({});
      return { outcome: "failed" as const };
    }
    if (!Number.isFinite(amount) || Math.round(amount * 100) !== expectedMinor || currency !== legacyPayment.currency.toUpperCase()) {
      await recordException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: merchant.id, expectedAmountMinor: expectedMinor, observedAmountMinor: Number.isFinite(amount) ? Math.round(amount * 100) : null, expectedCurrency: legacyPayment.currency, observedCurrency: currency, reason: "Subscription payment amount or currency mismatch", payload: rawPayload });
      await db.update(paymentsTable).set({ status: "reconciliation_required", reviewNote: "Flutterwave webhook amount/currency mismatch", reviewedBy: "flutterwave_webhook", reviewedAt: new Date() }).where(eq(paymentsTable.id, legacyPayment.id));
      return { outcome: "reconciliation_required" as const };
    }
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from ${subscriptionsTable} where id=${subscription.id} and merchant_id=${merchant.id} for update`);
      await tx.execute(sql`select id from ${paymentsTable} where id=${legacyPayment!.id} and merchant_id=${merchant.id} for update`);
      const currentPayment = (await tx.select().from(paymentsTable).where(eq(paymentsTable.id, legacyPayment!.id)).limit(1))[0];
      const currentSubscription = (await tx.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, subscription.id)).limit(1))[0];
      if (!currentPayment || !currentSubscription) throw new Error("Subscription payment state unavailable");
      if (currentPayment.status === "confirmed") return false;
      const remaining = Math.max(0, Number(currentSubscription.amountDue) - Number(currentSubscription.amountPaid));
      if (remaining <= 0 || Number(currentPayment.amount) > remaining) throw new Error("Subscription payment exceeds the outstanding obligation");
      await tx.update(paymentsTable).set({ status: "confirmed", evidenceReference: providerId ?? reference, reviewedBy: "flutterwave_webhook", reviewedAt: new Date(), reviewNote: "Verified from Flutterwave webhook and provider transaction query" }).where(and(eq(paymentsTable.id, currentPayment.id), eq(paymentsTable.status, currentPayment.status)));
      const nextPaid = Number(currentSubscription.amountPaid) + Number(currentPayment.amount);
      const settled = nextPaid + 0.005 >= Number(currentSubscription.amountDue);
      const [updatedSubscription] = await tx.update(subscriptionsTable).set({ amountPaid: nextPaid.toFixed(2), status: settled ? "active" : "past_due", paymentMethod: "flutterwave" }).where(and(eq(subscriptionsTable.id, currentSubscription.id), eq(subscriptionsTable.amountPaid, currentSubscription.amountPaid))).returning();
      if (!updatedSubscription) throw new Error("Subscription changed while payment was processing");
      await qualifyReferralForPayment(tx, { referredMerchantId: merchant.id, paymentId: currentPayment.id, subscription: updatedSubscription, amountMinor: Math.round(Number(currentPayment.amount) * 100), currency: currentPayment.currency });
      if (settled) await ensureReferralPeriodForPaidSubscription(tx, merchant.id, updatedSubscription);
      if (settled && merchant.status !== "banned") await tx.update(merchantsTable).set({ status: "active" }).where(eq(merchantsTable.id, merchant.id));
      return true;
    });
    return { outcome: result ? "successful" as const : "duplicate" as const };
  }

  await recordException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId, orderId, paymentIntentId: intent?.id ?? null, reason: "Flutterwave event could not be mapped to a supported TS Pay payment", payload: rawPayload });
  return { outcome: "reconciliation_required" as const };
}

router.post("/webhooks/flutterwave", async (req, res): Promise<void> => {
  const body = rawBody(req);
  if (!body) {
    res.status(400).json({ error: "Flutterwave webhook body must be received as raw JSON" });
    return;
  }
  const signature = req.header("verif-hash");
  if (!verifyFlutterwaveWebhookSignature(body, signature)) {
    res.status(401).json({ error: "Invalid Flutterwave webhook signature" });
    return;
  }
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(body.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    payload = parsed as Record<string, unknown>;
  } catch {
    res.status(400).json({ error: "Invalid Flutterwave webhook JSON" });
    return;
  }
  const eventId = eventIdFrom(req, payload);
  if (!eventId) {
    res.status(400).json({ error: "Flutterwave webhook event id is required" });
    return;
  }
  const eventType = String(payload.event ?? payload.type ?? "unknown");
  const data = webhookData(payload);
  const providerPaymentId = data.id == null ? null : String(data.id);

  try {
    const inserted = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(paymentWebhookEventsTable).where(and(eq(paymentWebhookEventsTable.provider, "flutterwave"), eq(paymentWebhookEventsTable.webhookId, eventId))).limit(1);
      if (existing) return false;
      await tx.insert(paymentWebhookEventsTable).values({ provider: "flutterwave", webhookId: eventId, eventType, providerPaymentId, payload, status: "received" });
      return true;
    });
    if (!inserted) {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    const transactionId = data.id == null ? null : String(data.id);
    if (!transactionId) {
      await db.update(paymentWebhookEventsTable).set({ status: "reconciliation_required", error: "Webhook contained no provider transaction id", processedAt: new Date() }).where(and(eq(paymentWebhookEventsTable.provider, "flutterwave"), eq(paymentWebhookEventsTable.webhookId, eventId)));
      res.status(200).json({ received: true, status: "reconciliation_required" });
      return;
    }

    const verified = await verifyFlutterwaveTransaction(transactionId);
    const result = await processVerifiedTransaction(verified as unknown as Record<string, unknown>, eventId, payload);
    await db.update(paymentWebhookEventsTable).set({ status: result.outcome === "reconciliation_required" ? "reconciliation_required" : "processed", processedAt: new Date() }).where(and(eq(paymentWebhookEventsTable.provider, "flutterwave"), eq(paymentWebhookEventsTable.webhookId, eventId)));
    res.status(200).json({ received: true, status: result.outcome });
  } catch (error) {
    await db.update(paymentWebhookEventsTable).set({ status: "failed", error: error instanceof Error ? error.message : "Webhook processing failed", processedAt: new Date() }).where(and(eq(paymentWebhookEventsTable.provider, "flutterwave"), eq(paymentWebhookEventsTable.webhookId, eventId)));
    res.status(502).json({ error: "Flutterwave webhook could not be reconciled" });
  }
});

export default router;
