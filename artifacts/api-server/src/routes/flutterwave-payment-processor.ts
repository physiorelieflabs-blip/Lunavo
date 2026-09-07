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
  paymentsTable,
  subscriptionsTable,
} from "@workspace/db";
import {
  calculateMerchantNetMinor,
  calculateTsCommerceFeeMinor,
} from "../lib/critical-payment-rules";
import {
  flutterwaveAmount,
  flutterwaveStatus,
  flutterwaveTransactionId,
} from "../lib/flutterwave-client";
import {
  ensureReferralPeriodForPaidSubscription,
  qualifyReferralForPayment,
  reverseReferralReward,
} from "../lib/referrals";

type ProviderTransaction = Record<string, unknown>;

function txRef(value: ProviderTransaction): string {
  return typeof value.tx_ref === "string" ? value.tx_ref.trim() : "";
}

function customerEmail(value: ProviderTransaction): string | null {
  const customer = value.customer;
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) return null;
  const email = (customer as ProviderTransaction).email;
  return typeof email === "string" ? email.trim().toLowerCase() : null;
}

function meta(value: ProviderTransaction): ProviderTransaction {
  const metadata = value.meta;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as ProviderTransaction)
    : {};
}

function providerFeeMinor(value: ProviderTransaction): number | null {
  const raw = value.app_fee;
  if (raw === undefined || raw === null || raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

async function recordReconciliationException(input: {
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
  payload: ProviderTransaction;
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

async function findIntentByReference(reference: string) {
  if (!reference) return null;
  return (await db.select().from(paymentIntentsTable).where(or(
    eq(paymentIntentsTable.evidenceReference, reference),
    eq(paymentIntentsTable.idempotencyKey, reference),
  )).limit(1))[0] ?? null;
}

async function findSubscriptionPaymentByReference(reference: string) {
  if (!reference) return null;
  return (await db.select().from(paymentsTable).where(and(
    eq(paymentsTable.method, "flutterwave"),
    or(eq(paymentsTable.reference, reference), eq(paymentsTable.evidenceReference, reference)),
  )).limit(1))[0] ?? null;
}

async function applyProviderFeeAccounting(input: {
  paymentIntentId: number;
  merchantId: number;
  orderId: number;
  grossMinor: number;
  currency: string;
  providerFeeMinor: number | null;
  providerTransactionId: string | null;
  providerEventId: string;
}) {
  const tsFeeMinor = calculateTsCommerceFeeMinor(input.grossMinor);
  const merchantNetMinor = calculateMerchantNetMinor(input.grossMinor, input.providerFeeMinor);
  await db.execute(sql`
    UPDATE payment_intents
    SET provider_transaction_id=${input.providerTransactionId},
        provider_event_id=${input.providerEventId},
        provider_fee_minor=${input.providerFeeMinor},
        ts_commerce_fee_minor=${tsFeeMinor},
        merchant_net_minor=${merchantNetMinor}
    WHERE id=${input.paymentIntentId}
  `);
  if (input.providerFeeMinor !== null && input.providerFeeMinor > 0) {
    await db.insert(ledgerEntriesTable).values({
      merchantId: input.merchantId,
      orderId: input.orderId,
      amountMinor: -input.providerFeeMinor,
      currency: input.currency,
      entryType: "fee",
      referenceKey: `payment:${input.paymentIntentId}:provider-fee`,
    }).onConflictDoNothing({ target: ledgerEntriesTable.referenceKey });
  }
  await db.insert(ledgerEntriesTable).values({
    merchantId: input.merchantId,
    orderId: input.orderId,
    amountMinor: -tsFeeMinor,
    currency: input.currency,
    entryType: "fee",
    referenceKey: `payment:${input.paymentIntentId}:ts-fee`,
  }).onConflictDoNothing({ target: ledgerEntriesTable.referenceKey });
}

function providerReversal(value: ProviderTransaction): "refunded" | "charged_back" | "disputed" | null {
  const refund = String(value.refund_status ?? "").trim().toLowerCase();
  if (["successful", "processed", "refunded", "completed"].includes(refund)) return "refunded";
  const dispute = String(value.dispute_status ?? "").trim().toLowerCase();
  if (["chargeback", "charged_back", "reversed"].includes(dispute)) return "charged_back";
  if (["open", "active", "disputed"].includes(dispute)) return "disputed";
  return null;
}

async function reverseOrderPayment(input: {
  intentId: number;
  merchantId: number;
  orderId: number;
  amountMinor: number;
  currency: string;
  status: "refunded" | "charged_back" | "disputed";
  reason: string;
  providerTransactionId: string | null;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM payment_intents WHERE id=${input.intentId} AND merchant_id=${input.merchantId} FOR UPDATE`);
    const intent = (await tx.select().from(paymentIntentsTable).where(eq(paymentIntentsTable.id, input.intentId)).limit(1))[0];
    if (!intent) throw new Error("Payment intent not found during provider reversal");
    if (["refunded", "charged_back"].includes(intent.status)) return "duplicate" as const;
    if (!["successful", "verified"].includes(intent.status)) return "pending" as const;

    await tx.update(paymentIntentsTable).set({ status: input.status }).where(eq(paymentIntentsTable.id, intent.id));
    const [record] = await tx.select().from(paymentRecordsTable).where(eq(paymentRecordsTable.intentId, intent.id)).limit(1);
    if (record) {
      await tx.update(paymentRecordsTable).set({ status: input.status, verifiedBy: "flutterwave_reversal", verifiedAt: new Date(), evidenceReference: input.providerTransactionId ?? record.evidenceReference }).where(eq(paymentRecordsTable.id, record.id));
    }
    await tx.insert(ledgerEntriesTable).values({
      merchantId: input.merchantId,
      orderId: input.orderId,
      paymentRecordId: record?.id ?? null,
      amountMinor: -input.amountMinor,
      currency: input.currency,
      entryType: "refund",
      referenceKey: `payment:${input.intentId}:${input.status}`,
    }).onConflictDoNothing({ target: ledgerEntriesTable.referenceKey });
    await tx.update(ordersTable).set({ status: "pending" }).where(and(eq(ordersTable.id, input.orderId), eq(ordersTable.merchantId, input.merchantId), eq(ordersTable.status, "paid")));
    await tx.insert(commerceTransitionHistoryTable).values({ merchantId: input.merchantId, orderId: input.orderId, paymentIntentId: input.intentId, entityType: "payment_intent", fromStatus: intent.status, toStatus: input.status, actorId: "flutterwave_webhook", note: input.reason });
    await tx.insert(activityTable).values({ merchantId: input.merchantId, type: "payment_reversed", title: `Payment ${input.status.replaceAll("_", " ")}`, description: input.reason, amount: (input.amountMinor / 100).toFixed(2), currency: input.currency, tone: "negative" });
    return input.status;
  });
}

async function processOrderPayment(transaction: ProviderTransaction, eventId: string, rawPayload: ProviderTransaction, intent: NonNullable<Awaited<ReturnType<typeof findIntentByReference>>>) {
  const providerId = flutterwaveTransactionId(transaction as any);
  const reference = txRef(transaction);
  const [order] = intent.orderId === null ? [] : await db.select().from(ordersTable).where(and(eq(ordersTable.id, intent.orderId), eq(ordersTable.merchantId, intent.merchantId))).limit(1);
  const [customer] = order ? await db.select().from(customersTable).where(and(eq(customersTable.id, order.customerId), eq(customersTable.merchantId, intent.merchantId))).limit(1) : [];
  const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, intent.merchantId)).limit(1);
  const [record] = await db.select().from(paymentRecordsTable).where(eq(paymentRecordsTable.intentId, intent.id)).limit(1);
  if (!order || !customer || !merchant || !record) {
    await recordReconciliationException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: intent.merchantId, orderId: intent.orderId, paymentIntentId: intent.id, reason: "Payment session references missing TS Commerce records", payload: rawPayload });
    return "reconciliation_required" as const;
  }

  const metadata = meta(transaction);
  if (metadata.merchant_id !== undefined && String(metadata.merchant_id) !== String(merchant.id)) {
    await recordReconciliationException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: merchant.id, orderId: order.id, paymentIntentId: intent.id, reason: "Flutterwave metadata merchant does not match the TS Pay merchant", payload: rawPayload });
    return "reconciliation_required" as const;
  }
  if (metadata.order_id !== undefined && String(metadata.order_id) !== String(order.id)) {
    await recordReconciliationException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: merchant.id, orderId: order.id, paymentIntentId: intent.id, reason: "Flutterwave metadata order does not match the TS Pay order", payload: rawPayload });
    return "reconciliation_required" as const;
  }
  const email = customerEmail(transaction);
  if (email && email !== customer.email.trim().toLowerCase()) {
    await recordReconciliationException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: merchant.id, orderId: order.id, paymentIntentId: intent.id, reason: "Flutterwave customer email does not match the TS Commerce customer", payload: rawPayload });
    return "reconciliation_required" as const;
  }

  const amount = flutterwaveAmount(transaction as any);
  const observedMinor = Number.isFinite(amount) ? Math.round(amount * 100) : null;
  const currency = String(transaction.currency ?? "").trim().toUpperCase();
  if (observedMinor === null || observedMinor !== intent.amountMinor || currency !== intent.currency.toUpperCase()) {
    await recordReconciliationException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: merchant.id, orderId: order.id, paymentIntentId: intent.id, expectedAmountMinor: intent.amountMinor, observedAmountMinor: observedMinor, expectedCurrency: intent.currency, observedCurrency: currency || null, reason: "Flutterwave amount or currency does not match the server payment session", payload: rawPayload });
    await db.update(paymentIntentsTable).set({ status: "reconciliation_required" }).where(eq(paymentIntentsTable.id, intent.id));
    return "reconciliation_required" as const;
  }
  if (!reference || (intent.evidenceReference && intent.evidenceReference !== reference && intent.evidenceReference !== providerId)) {
    await recordReconciliationException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: merchant.id, orderId: order.id, paymentIntentId: intent.id, reason: "Flutterwave transaction reference does not match the TS Pay session", payload: rawPayload });
    await db.update(paymentIntentsTable).set({ status: "reconciliation_required" }).where(eq(paymentIntentsTable.id, intent.id));
    return "reconciliation_required" as const;
  }

  const reversal = providerReversal(transaction);
  if (reversal) {
    return reverseOrderPayment({ intentId: intent.id, merchantId: merchant.id, orderId: order.id, amountMinor: intent.amountMinor, currency: intent.currency, status: reversal, reason: `Flutterwave reported ${reversal} for the transaction`, providerTransactionId: providerId });
  }

  const providerState = flutterwaveStatus(transaction as any);
  if (providerState === "failed") {
    await db.transaction(async (tx) => {
      await tx.update(paymentIntentsTable).set({ status: "failed", evidenceReference: reference || intent.evidenceReference }).where(eq(paymentIntentsTable.id, intent.id));
      await tx.update(paymentRecordsTable).set({ status: "failed", evidenceReference: reference || undefined }).where(eq(paymentRecordsTable.intentId, intent.id));
    });
    return "failed" as const;
  }
  if (providerState !== "paid") return "pending" as const;

  const providerFee = providerFeeMinor(transaction);
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM payment_intents WHERE id=${intent.id} AND merchant_id=${merchant.id} FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM payment_records WHERE intent_id=${intent.id} AND merchant_id=${merchant.id} FOR UPDATE`);
    const currentIntent = (await tx.select().from(paymentIntentsTable).where(eq(paymentIntentsTable.id, intent.id)).limit(1))[0];
    const currentRecord = (await tx.select().from(paymentRecordsTable).where(eq(paymentRecordsTable.intentId, intent.id)).limit(1))[0];
    if (!currentIntent || !currentRecord) throw new Error("TS Pay payment records are unavailable");
    if (["successful", "verified"].includes(currentIntent.status)) return "duplicate" as const;

    const duplicateProvider = await tx.execute(sql`SELECT id FROM payment_intents WHERE provider_transaction_id=${providerId} AND id <> ${currentIntent.id} LIMIT 1`);
    if (providerId && duplicateProvider.rows.length) throw new Error("This Flutterwave transaction is already linked to another TS Pay payment");

    await tx.update(paymentIntentsTable).set({ status: "successful", evidenceReference: providerId ?? reference }).where(eq(paymentIntentsTable.id, currentIntent.id));
    await tx.update(paymentRecordsTable).set({ status: "successful", evidenceReference: providerId ?? reference, verifiedBy: "flutterwave_webhook", verifiedAt: new Date() }).where(eq(paymentRecordsTable.id, currentRecord.id));
    await tx.execute(sql`UPDATE payment_intents SET provider_transaction_id=${providerId}, provider_event_id=${eventId}, provider_fee_minor=${providerFee}, ts_commerce_fee_minor=${calculateTsCommerceFeeMinor(intent.amountMinor)}, merchant_net_minor=${calculateMerchantNetMinor(intent.amountMinor, providerFee)}, settlement_amount_minor=${intent.amountMinor}, settlement_currency=${currency} WHERE id=${currentIntent.id}`);
    await tx.insert(ledgerEntriesTable).values({ merchantId: merchant.id, orderId: order.id, paymentRecordId: currentRecord.id, amountMinor: intent.amountMinor, currency, entryType: "sale", referenceKey: `payment:${currentIntent.id}` }).onConflictDoNothing({ target: ledgerEntriesTable.referenceKey });
    const tsFeeMinor = calculateTsCommerceFeeMinor(intent.amountMinor);
    if (providerFee !== null && providerFee > 0) {
      await tx.insert(ledgerEntriesTable).values({ merchantId: merchant.id, orderId: order.id, paymentRecordId: currentRecord.id, amountMinor: -providerFee, currency, entryType: "fee", referenceKey: `payment:${currentIntent.id}:provider-fee` }).onConflictDoNothing({ target: ledgerEntriesTable.referenceKey });
    }
    await tx.insert(ledgerEntriesTable).values({ merchantId: merchant.id, orderId: order.id, paymentRecordId: currentRecord.id, amountMinor: -tsFeeMinor, currency, entryType: "fee", referenceKey: `payment:${currentIntent.id}:ts-fee` }).onConflictDoNothing({ target: ledgerEntriesTable.referenceKey });
    await tx.update(ordersTable).set({ status: "paid" }).where(and(eq(ordersTable.id, order.id), eq(ordersTable.merchantId, merchant.id), eq(ordersTable.status, "pending")));
    await tx.insert(commerceTransitionHistoryTable).values({ merchantId: merchant.id, orderId: order.id, paymentIntentId: currentIntent.id, entityType: "payment_intent", fromStatus: currentIntent.status, toStatus: "successful", actorId: "flutterwave_webhook", note: "Provider-verified Flutterwave payment" });
    await tx.insert(activityTable).values({ merchantId: merchant.id, type: "payment_verified", title: "Payment verified", description: "Flutterwave payment was re-queried and verified server-side. Gross sale, provider fee and TS Commerce fee were posted separately.", amount: (intent.amountMinor / 100).toFixed(2), currency, tone: "positive" });
    return "successful" as const;
  });
  return result;
}

async function processSubscriptionPayment(transaction: ProviderTransaction, eventId: string, rawPayload: ProviderTransaction, payment: NonNullable<Awaited<ReturnType<typeof findSubscriptionPaymentByReference>>>) {
  const providerId = flutterwaveTransactionId(transaction as any);
  const reference = txRef(transaction);
  const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, payment.merchantId)).limit(1);
  const [subscription] = merchant ? await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.merchantId, merchant.id)).limit(1) : [];
  if (!merchant || !subscription) {
    await recordReconciliationException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: payment.merchantId, reason: "Subscription payment is not linked to a merchant subscription", payload: rawPayload });
    return "reconciliation_required" as const;
  }
  const metadata = meta(transaction);
  if (metadata.merchant_id !== undefined && String(metadata.merchant_id) !== String(merchant.id)) {
    await recordReconciliationException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: merchant.id, reason: "Flutterwave metadata merchant does not match subscription merchant", payload: rawPayload });
    return "reconciliation_required" as const;
  }
  if (metadata.subscription_id !== undefined && String(metadata.subscription_id) !== String(subscription.id)) {
    await recordReconciliationException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: merchant.id, reason: "Flutterwave metadata subscription does not match the TS Commerce subscription", payload: rawPayload });
    return "reconciliation_required" as const;
  }
  const amount = flutterwaveAmount(transaction as any);
  const amountMinor = Number.isFinite(amount) ? Math.round(amount * 100) : null;
  const expectedMinor = Math.round(Number(payment.amount) * 100);
  const currency = String(transaction.currency ?? "").trim().toUpperCase();
  if (amountMinor === null || amountMinor !== expectedMinor || currency !== payment.currency.toUpperCase()) {
    await recordReconciliationException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: merchant.id, expectedAmountMinor: expectedMinor, observedAmountMinor: amountMinor, expectedCurrency: payment.currency, observedCurrency: currency || null, reason: "Flutterwave subscription amount or currency mismatch", payload: rawPayload });
    await db.update(paymentsTable).set({ status: "reconciliation_required", reviewNote: "Flutterwave webhook amount/currency mismatch", reviewedBy: "flutterwave_webhook", reviewedAt: new Date() }).where(eq(paymentsTable.id, payment.id));
    return "reconciliation_required" as const;
  }
  if (providerReversal(transaction)) {
    const reason = `Flutterwave reported ${providerReversal(transaction)} for the subscription payment`;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM payments WHERE id=${payment.id} AND merchant_id=${merchant.id} FOR UPDATE`);
      const current = (await tx.select().from(paymentsTable).where(eq(paymentsTable.id, payment.id)).limit(1))[0];
      if (!current || current.status !== "confirmed") return;
      await tx.execute(sql`SELECT id FROM subscriptions WHERE id=${subscription.id} AND merchant_id=${merchant.id} FOR UPDATE`);
      const locked = (await tx.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, subscription.id)).limit(1))[0];
      if (!locked) return;
      const nextPaid = Math.max(0, Number(locked.amountPaid) - Number(current.amount));
      await tx.update(subscriptionsTable).set({ amountPaid: nextPaid.toFixed(2), status: nextPaid + 0.005 >= Number(locked.amountDue) ? "active" : "past_due" }).where(eq(subscriptionsTable.id, locked.id));
      await tx.update(paymentsTable).set({ status: "refunded", evidenceReference: providerId ?? reference, reviewedBy: "flutterwave_webhook", reviewedAt: new Date(), reviewNote: reason }).where(eq(paymentsTable.id, current.id));
      await reverseReferralReward(tx, current.id, reason);
    });
    return "reversed" as const;
  }
  const state = flutterwaveStatus(transaction as any);
  if (state === "failed") {
    await db.update(paymentsTable).set({ status: "failed", reviewNote: "Flutterwave reported payment failure", reviewedBy: "flutterwave_webhook", reviewedAt: new Date() }).where(eq(paymentsTable.id, payment.id));
    return "failed" as const;
  }
  if (state !== "paid") return "pending" as const;

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM payments WHERE id=${payment.id} AND merchant_id=${merchant.id} FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM subscriptions WHERE id=${subscription.id} AND merchant_id=${merchant.id} FOR UPDATE`);
    const currentPayment = (await tx.select().from(paymentsTable).where(eq(paymentsTable.id, payment.id)).limit(1))[0];
    const currentSubscription = (await tx.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, subscription.id)).limit(1))[0];
    if (!currentPayment || !currentSubscription) throw new Error("Subscription payment state unavailable");
    if (currentPayment.status === "confirmed") return "duplicate" as const;
    const duplicateProvider = await tx.execute(sql`SELECT id FROM payments WHERE provider_transaction_id=${providerId} AND id <> ${currentPayment.id} LIMIT 1`);
    if (providerId && duplicateProvider.rows.length) throw new Error("This Flutterwave transaction is already linked to another TS Commerce payment");
    const remaining = Math.max(0, Number(currentSubscription.amountDue) - Number(currentSubscription.amountPaid));
    if (remaining <= 0 || Number(currentPayment.amount) > remaining) throw new Error("Flutterwave subscription payment exceeds the outstanding obligation");
    const settled = Number(currentSubscription.amountPaid) + Number(currentPayment.amount) + 0.005 >= Number(currentSubscription.amountDue);
    await tx.update(paymentsTable).set({ status: "confirmed", evidenceReference: providerId ?? reference, reviewedBy: "flutterwave_webhook", reviewedAt: new Date(), reviewNote: "Verified by Flutterwave webhook and transaction re-query" }).where(eq(paymentsTable.id, currentPayment.id));
    const nextPaid = Number(currentSubscription.amountPaid) + Number(currentPayment.amount);
    const [updatedSubscription] = await tx.update(subscriptionsTable).set({ amountPaid: nextPaid.toFixed(2), paymentMethod: "flutterwave", status: settled ? "active" : "past_due" }).where(and(eq(subscriptionsTable.id, currentSubscription.id), eq(subscriptionsTable.amountPaid, currentSubscription.amountPaid))).returning();
    if (!updatedSubscription) throw new Error("Subscription changed while payment was processing");
    const providerFee = providerFeeMinor(transaction);
    await tx.execute(sql`UPDATE payments SET provider_transaction_id=${providerId}, provider_event_id=${eventId}, provider_fee_minor=${providerFee}, ts_commerce_fee_minor=${calculateTsCommerceFeeMinor(expectedMinor)}, merchant_net_minor=${calculateMerchantNetMinor(expectedMinor, providerFee)} WHERE id=${currentPayment.id}`);
    await qualifyReferralForPayment(tx, { referredMerchantId: merchant.id, paymentId: currentPayment.id, subscription: updatedSubscription, amountMinor, currency: currentPayment.currency });
    if (settled) await ensureReferralPeriodForPaidSubscription(tx, merchant.id, updatedSubscription);
    if (settled && merchant.status === "suspended") await tx.update(merchantsTable).set({ status: "active" }).where(eq(merchantsTable.id, merchant.id));
    return "successful" as const;
  });
  return result;
}

export async function processVerifiedFlutterwaveTransaction(
  transaction: ProviderTransaction,
  eventId: string,
  rawPayload: ProviderTransaction,
) {
  const reference = txRef(transaction);
  const intent = await findIntentByReference(reference);
  const subscriptionPayment = intent ? null : await findSubscriptionPaymentByReference(reference);
  if (!intent && !subscriptionPayment) {
    await recordReconciliationException({
      eventId,
      providerTransactionId: flutterwaveTransactionId(transaction as any),
      paymentReference: reference || null,
      observedAmountMinor: Number.isFinite(flutterwaveAmount(transaction as any)) ? Math.round(flutterwaveAmount(transaction as any) * 100) : null,
      observedCurrency: String(transaction.currency ?? "").toUpperCase() || null,
      reason: "Flutterwave transaction has no matching TS Pay payment session",
      payload: rawPayload,
    });
    return "reconciliation_required" as const;
  }
  if (intent) return processOrderPayment(transaction, eventId, rawPayload, intent);
  return processSubscriptionPayment(transaction, eventId, rawPayload, subscriptionPayment!);
}
