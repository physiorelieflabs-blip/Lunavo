import { Router, type Request } from "express";
import { and, eq, or, sql } from "drizzle-orm";
import {
  activityTable,
  commerceTransitionHistoryTable,
  customersTable,
  db,
  ledgerEntriesTable,
  merchantsTable,
  ordersTable,
  paymentIntentsTable,
  paymentRecordsTable,
  paymentWebhookEventsTable,
  paymentsTable,
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

type WebhookPayload = Record<string, unknown>;

function rawBody(req: Request): Buffer | null {
  return Buffer.isBuffer(req.body) ? req.body : null;
}

function eventIdFrom(req: Request, payload: WebhookPayload): string | null {
  for (const value of [
    req.header("flutterwave-event-id"),
    req.header("x-flutterwave-event-id"),
    req.header("webhook-id"),
    req.header("x-webhook-id"),
  ]) {
    if (value?.trim()) return value.trim();
  }
  for (const key of ["event_id", "eventId", "webhook_id", "webhookId"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function webhookData(payload: WebhookPayload): WebhookPayload {
  const data = payload.data;
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as WebhookPayload)
    : payload;
}

function txRef(transaction: WebhookPayload): string {
  return typeof transaction.tx_ref === "string" ? transaction.tx_ref.trim() : "";
}

function customerEmail(transaction: WebhookPayload): string | null {
  const customer = transaction.customer;
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) return null;
  const email = (customer as WebhookPayload).email;
  return typeof email === "string" ? email.trim().toLowerCase() : null;
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
  payload: WebhookPayload;
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

async function mapIntent(reference: string) {
  if (!reference) return null;
  return (await db.select().from(paymentIntentsTable).where(or(
    eq(paymentIntentsTable.evidenceReference, reference),
    eq(paymentIntentsTable.idempotencyKey, reference),
  )).limit(1))[0] ?? null;
}

async function mapSubscriptionPayment(reference: string) {
  if (!reference) return null;
  return (await db.select().from(paymentsTable).where(and(
    eq(paymentsTable.method, "flutterwave"),
    or(
      eq(paymentsTable.reference, reference),
      eq(paymentsTable.evidenceReference, reference),
    ),
  )).limit(1))[0] ?? null;
}

export async function processVerifiedFlutterwaveTransaction(
  transaction: WebhookPayload,
  eventId: string,
  rawPayload: WebhookPayload,
) {
  const providerId = flutterwaveTransactionId(transaction as any);
  const reference = txRef(transaction);
  const status = flutterwaveStatus(transaction as any);
  const amount = flutterwaveAmount(transaction as any);
  const currency = String(transaction.currency ?? "").trim().toUpperCase();

  const intent = await mapIntent(reference);
  const subscriptionPayment = intent ? null : await mapSubscriptionPayment(reference);

  if (!intent && !subscriptionPayment) {
    await recordException({
      eventId,
      providerTransactionId: providerId,
      paymentReference: reference || null,
      observedAmountMinor: Number.isFinite(amount) ? Math.round(amount * 100) : null,
      observedCurrency: currency || null,
      reason: "Flutterwave transaction has no matching TS Pay payment session or subscription payment",
      payload: rawPayload,
    });
    return "reconciliation_required" as const;
  }

  if (status === "pending") {
    if (intent) {
      await db.transaction(async (tx) => {
        await tx.update(paymentIntentsTable).set({
          status: "pending",
          evidenceReference: reference || intent.evidenceReference,
        }).where(eq(paymentIntentsTable.id, intent.id));
        await tx.update(paymentRecordsTable).set({
          status: "pending",
          evidenceReference: reference || undefined,
        }).where(eq(paymentRecordsTable.intentId, intent.id));
      });
    } else if (subscriptionPayment) {
      await db.update(paymentsTable).set({ status: "pending" }).where(eq(paymentsTable.id, subscriptionPayment.id));
    }
    return "pending" as const;
  }

  if (intent) {
    const [order] = intent.orderId === null
      ? []
      : await db.select().from(ordersTable).where(and(
          eq(ordersTable.id, intent.orderId),
          eq(ordersTable.merchantId, intent.merchantId),
        )).limit(1);
    const [customer] = order
      ? await db.select().from(customersTable).where(and(
          eq(customersTable.id, order.customerId),
          eq(customersTable.merchantId, intent.merchantId),
        )).limit(1)
      : [];
    const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, intent.merchantId)).limit(1);
    const [record] = await db.select().from(paymentRecordsTable).where(eq(paymentRecordsTable.intentId, intent.id)).limit(1);

    if (!order || !customer || !merchant || !record) {
      await recordException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: intent.merchantId, orderId: intent.orderId, paymentIntentId: intent.id, reason: "Payment session references missing TS Commerce records", payload: rawPayload });
      return "reconciliation_required" as const;
    }
    if (status === "failed") {
      await db.transaction(async (tx) => {
        await tx.update(paymentIntentsTable).set({ status: "failed", evidenceReference: reference || intent.evidenceReference }).where(eq(paymentIntentsTable.id, intent.id));
        await tx.update(paymentRecordsTable).set({ status: "failed", evidenceReference: reference || undefined }).where(eq(paymentRecordsTable.intentId, intent.id));
      });
      return "failed" as const;
    }
    const expectedAmountMinor = intent.amountMinor;
    if (!Number.isFinite(amount) || Math.round(amount * 100) !== expectedAmountMinor || currency !== intent.currency.toUpperCase()) {
      await recordException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: merchant.id, orderId: order.id, paymentIntentId: intent.id, expectedAmountMinor, observedAmountMinor: Number.isFinite(amount) ? Math.round(amount * 100) : null, expectedCurrency: intent.currency, observedCurrency: currency || null, reason: "Verified Flutterwave amount or currency does not match the TS Pay payment session", payload: rawPayload });
      await db.update(paymentIntentsTable).set({ status: "reconciliation_required" }).where(eq(paymentIntentsTable.id, intent.id));
      return "reconciliation_required" as const;
    }
    if (!reference || (intent.evidenceReference && reference !== intent.evidenceReference)) {
      await recordException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: merchant.id, orderId: order.id, paymentIntentId: intent.id, reason: "Flutterwave payment reference does not match the TS Pay session", payload: rawPayload });
      await db.update(paymentIntentsTable).set({ status: "reconciliation_required" }).where(eq(paymentIntentsTable.id, intent.id));
      return "reconciliation_required" as const;
    }
    const email = customerEmail(transaction);
    if (email && email !== customer.email.trim().toLowerCase()) {
      await recordException({ eventId, providerTransactionId: providerId, paymentReference: reference, merchantId: merchant.id, orderId: order.id, paymentIntentId: intent.id, reason: "Flutterwave customer identity does not match the TS Commerce customer", payload: rawPayload });
      await db.update(paymentIntentsTable).set({ status: "reconciliation_required" }).where(eq(paymentIntentsTable.id, intent.id));
      return "reconciliation_required" as const;
    }

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM payment_intents WHERE id=${intent.id} AND merchant_id=${merchant.id} FOR UPDATE`);
      await tx.execute(sql`SELECT id FROM payment_records WHERE intent_id=${intent.id} AND merchant_id=${merchant.id} FOR UPDATE`);
      const currentIntent = (await tx.select().from(paymentIntentsTable).where(eq(paymentIntentsTable.id, intent.id)).limit(1))[0];
      const currentRecord = (await tx.select().from(paymentRecordsTable).where(eq(paymentRecordsTable.intentId, intent.id)).limit(1))[0];
      if (!currentIntent || !currentRecord) throw new Error("TS Pay payment record is unavailable");
      if (["successful", "verified"].includes(currentIntent.status)) return "duplicate" as const;

      await tx.update(paymentIntentsTable).set({
        status: "successful",
        evidenceReference: providerId ?? reference,
        settlementAmountMinor: Math.round(amount * 100),
        settlementCurrency: currency,
      }).where(eq(paymentIntentsTable.id, currentIntent.id));
      await tx.update(paymentRecordsTable).set({
        status: "successful",
        evidenceReference: providerId ?? reference,
        verifiedBy: "flutterwave_webhook",
        verifiedAt: new Date(),
      }).where(eq(paymentRecordsTable.id, currentRecord.id));
      await tx.insert(ledgerEntriesTable).values({
        merchantId: merchant.id,
        orderId: order.id,
        paymentRecordId: currentRecord.id,
        amountMinor: Math.round(amount * 100),
        currency,
        entryType: "sale",
        referenceKey: `payment:${currentIntent.id}`,
      }).onConflictDoNothing({ target: ledgerEntriesTable.referenceKey });
      await tx.update(ordersTable).set({ status: "paid" }).where(and(
        eq(ordersTable.id, order.id),
        eq(ordersTable.merchantId, merchant.id),
        eq(ordersTable.status, "pending"),
      ));
      await tx.insert(commerceTransitionHistoryTable).values({
        merchantId: merchant.id,
        orderId: order.id,
        paymentIntentId: currentIntent.id,
        entityType: "payment_intent",
        fromStatus: currentIntent.status,
        toStatus: "successful",
        actorId: "flutterwave_webhook",
        note: "Provider-verified Flutterwave payment",
      });
      await tx.insert(activityTable).values({
        merchantId: merchant.id,
        type: "payment_verified",
        title: "Payment verified",
        description: "Flutterwave evidence was verified server-side and the sale was posted to TS Pay.",
        amount: (Math.round(amount * 100) / 100).toFixed(2),
        currency,
        tone: "positive",
      });
      return "successful" as const;
    });
    return result;
  }

  const payment = subscriptionPayment!;
  const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, payment.merchantId)).limit(1);
  const [subscription] = merchant
    ? await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.merchantId, merchant.id)).limit(1)
    : [];
  if (!merchant || !subscription) {
    await recordException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: payment.merchantId, reason: "Flutterwave subscription payment is not linked to a merchant subscription", payload: rawPayload });
    return "reconciliation_required" as const;
  }
  if (status === "failed") {
    await db.update(paymentsTable).set({ status: "failed", reviewNote: "Flutterwave reported payment failure", reviewedBy: "flutterwave_webhook", reviewedAt: new Date() }).where(eq(paymentsTable.id, payment.id));
    return "failed" as const;
  }
  const expectedMinor = Math.round(Number(payment.amount) * 100);
  if (!Number.isFinite(amount) || Math.round(amount * 100) !== expectedMinor || currency !== payment.currency.toUpperCase()) {
    await recordException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: merchant.id, expectedAmountMinor: expectedMinor, observedAmountMinor: Number.isFinite(amount) ? Math.round(amount * 100) : null, expectedCurrency: payment.currency, observedCurrency: currency || null, reason: "Flutterwave subscription amount or currency mismatch", payload: rawPayload });
    await db.update(paymentsTable).set({ status: "reconciliation_required", reviewNote: "Flutterwave webhook amount/currency mismatch", reviewedBy: "flutterwave_webhook", reviewedAt: new Date() }).where(eq(paymentsTable.id, payment.id));
    return "reconciliation_required" as const;
  }
  const providerRefunded = String(transaction.refund_status ?? "").toLowerCase();
  const providerDisputed = String(transaction.dispute_status ?? "").toLowerCase();
  const reversal = (["successful", "processed", "refunded"].includes(providerRefunded) && !["none", "not_refunded"].includes(providerRefunded))
    ? "Flutterwave refund reported"
    : (["open", "active", "disputed"].includes(providerDisputed) ? "Flutterwave dispute reported" : null);
  if (reversal) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM payments WHERE id=${payment.id} AND merchant_id=${merchant.id} FOR UPDATE`);
      const current = (await tx.select().from(paymentsTable).where(eq(paymentsTable.id, payment.id)).limit(1))[0];
      if (!current || current.status !== "confirmed") return;
      const [lockedSub] = await tx.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, subscription.id)).limit(1);
      if (!lockedSub) return;
      const amountPaid = Math.max(0, Number(lockedSub.amountPaid) - Number(current.amount));
      await tx.update(subscriptionsTable).set({ amountPaid: amountPaid.toFixed(2), status: amountPaid + 0.005 >= Number(lockedSub.amountDue) ? "active" : "past_due" }).where(eq(subscriptionsTable.id, lockedSub.id));
      await tx.update(paymentsTable).set({ status: "refunded", reviewNote: reversal, reviewedBy: "flutterwave_webhook", reviewedAt: new Date() }).where(and(eq(paymentsTable.id, current.id), eq(paymentsTable.status, "confirmed")));
      await reverseReferralReward(tx, current.id, reversal);
    });
    return "reversed" as const;
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM subscriptions WHERE id=${subscription.id} AND merchant_id=${merchant.id} FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM payments WHERE id=${payment.id} AND merchant_id=${merchant.id} FOR UPDATE`);
    const currentPayment = (await tx.select().from(paymentsTable).where(eq(paymentsTable.id, payment.id)).limit(1))[0];
    const currentSubscription = (await tx.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, subscription.id)).limit(1))[0];
    if (!currentPayment || !currentSubscription) throw new Error("Subscription payment state unavailable");
    if (currentPayment.status === "confirmed") return "duplicate" as const;
    const remaining = Math.max(0, Number(currentSubscription.amountDue) - Number(currentSubscription.amountPaid));
    if (remaining <= 0 || Number(currentPayment.amount) > remaining) throw new Error("Flutterwave subscription payment exceeds the outstanding obligation");
    await tx.update(paymentsTable).set({ status: "confirmed", evidenceReference: providerId ?? reference, reviewedBy: "flutterwave_webhook", reviewedAt: new Date(), reviewNote: "Verified by Flutterwave webhook and provider re-query" }).where(and(eq(paymentsTable.id, currentPayment.id), eq(paymentsTable.status, currentPayment.status)));
    const nextPaid = Number(currentSubscription.amountPaid) + Number(currentPayment.amount);
    const settled = nextPaid + 0.005 >= Number(currentSubscription.amountDue);
    const [updatedSubscription] = await tx.update(subscriptionsTable).set({ amountPaid: nextPaid.toFixed(2), paymentMethod: "flutterwave", status: settled ? "active" : "past_due" }).where(and(eq(subscriptionsTable.id, currentSubscription.id), eq(subscriptionsTable.amountPaid, currentSubscription.amountPaid))).returning();
    if (!updatedSubscription) throw new Error("Subscription changed while Flutterwave payment was processing");
    await qualifyReferralForPayment(tx, { referredMerchantId: merchant.id, paymentId: currentPayment.id, subscription: updatedSubscription, amountMinor: Math.round(Number(currentPayment.amount) * 100), currency: currentPayment.currency });
    if (settled) await ensureReferralPeriodForPaidSubscription(tx, merchant.id, updatedSubscription);
    if (settled && merchant.status !== "banned") await tx.update(merchantsTable).set({ status: "active" }).where(eq(merchantsTable.id, merchant.id));
    return "successful" as const;
  });
  return result;
}

router.post("/webhooks/flutterwave", async (req, res): Promise<void> => {
  const body = rawBody(req);
  if (!body) {
    res.status(400).json({ error: "Flutterwave webhook body must be received as raw JSON" });
    return;
  }
  if (!verifyFlutterwaveWebhookSignature(body, req.header("verif-hash"))) {
    res.status(401).json({ error: "Invalid Flutterwave webhook signature" });
    return;
  }
  let payload: WebhookPayload;
  try {
    const parsed = JSON.parse(body.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    payload = parsed as WebhookPayload;
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
      const [existing] = await tx.select().from(paymentWebhookEventsTable).where(and(
        eq(paymentWebhookEventsTable.provider, "flutterwave"),
        eq(paymentWebhookEventsTable.webhookId, eventId),
      )).limit(1);
      if (existing) return false;
      await tx.insert(paymentWebhookEventsTable).values({ provider: "flutterwave", webhookId: eventId, eventType, providerPaymentId, payload, status: "received" });
      return true;
    });
    if (!inserted) {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    if (!providerPaymentId) {
      await recordException({ eventId, reason: "Flutterwave webhook contained no provider transaction id", payload });
      await db.update(paymentWebhookEventsTable).set({ status: "reconciliation_required", error: "Missing provider transaction id", processedAt: new Date() }).where(and(eq(paymentWebhookEventsTable.provider, "flutterwave"), eq(paymentWebhookEventsTable.webhookId, eventId)));
      res.status(200).json({ received: true, status: "reconciliation_required" });
      return;
    }

    const verified = await verifyFlutterwaveTransaction(providerPaymentId);
    const outcome = await processVerifiedFlutterwaveTransaction(verified as unknown as WebhookPayload, eventId, payload);
    await db.update(paymentWebhookEventsTable).set({ status: outcome === "reconciliation_required" ? "reconciliation_required" : "processed", processedAt: new Date() }).where(and(eq(paymentWebhookEventsTable.provider, "flutterwave"), eq(paymentWebhookEventsTable.webhookId, eventId)));
    res.status(200).json({ received: true, status: outcome });
  } catch (error) {
    await db.update(paymentWebhookEventsTable).set({ status: "failed", error: error instanceof Error ? error.message : "Webhook processing failed", processedAt: new Date() }).where(and(eq(paymentWebhookEventsTable.provider, "flutterwave"), eq(paymentWebhookEventsTable.webhookId, eventId)));
    res.status(502).json({ error: "Flutterwave webhook could not be reconciled" });
  }
});

export default router;
