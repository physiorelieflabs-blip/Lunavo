import { and, eq, or, sql } from "drizzle-orm";
import {
  activityTable,
  commerceTransitionHistoryTable,
  customersTable,
  db,
  ledgerEntriesTable,
  merchantsTable,
  ordersTable,
  marketplaceBillingRecordsTable,
  marketplaceListingsTable,
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

type OrderIntent = NonNullable<Awaited<ReturnType<typeof findIntentByReference>>>;
type SubscriptionPayment = NonNullable<Awaited<ReturnType<typeof findSubscriptionPaymentByReference>>>;

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function txRef(value: ProviderTransaction): string {
  return text(value.tx_ref) || text(value.reference);
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
    ? metadata as ProviderTransaction
    : {};
}
function metaNumber(value: ProviderTransaction, key: string): string | null {
  const raw = value[key];
  return raw === undefined || raw === null ? null : String(raw);
}
function providerFeeMinor(value: ProviderTransaction): number | null {
  const raw = value.app_fee;
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
function providerSettlementMinor(value: ProviderTransaction): number | null {
  for (const key of ["settlement_amount", "settled_amount", "settlementAmount", "settledAmount"]) {
    const raw = value[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.round(n * 100);
  }
  return null;
}
function providerSettlementCurrency(value: ProviderTransaction, fallback: string): string | null {
  for (const key of ["settlement_currency", "settled_currency", "settlementCurrency", "settledCurrency"]) {
    const raw = text(value[key]);
    if (raw) return raw.toUpperCase();
  }
  return fallback || null;
}
function providerReversal(value: ProviderTransaction): "refunded" | "charged_back" | "disputed" | null {
  const refund = text(value.refund_status).toLowerCase();
  if (["successful", "processed", "refunded", "completed"].includes(refund)) return "refunded";
  const dispute = text(value.dispute_status).toLowerCase();
  if (["chargeback", "charged_back", "reversed"].includes(dispute)) return "charged_back";
  if (["open", "active", "disputed"].includes(dispute)) return "disputed";
  return null;
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

async function reverseOrderPayment(input: {
  intentId: number;
  merchantId: number;
  orderId: number;
  amountMinor: number;
  currency: string;
  status: "refunded" | "charged_back";
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
      await tx.update(paymentRecordsTable).set({
        status: input.status,
        verifiedBy: "flutterwave_reversal",
        verifiedAt: new Date(),
        evidenceReference: input.providerTransactionId ?? record.evidenceReference,
      }).where(eq(paymentRecordsTable.id, record.id));
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
    await tx.update(ordersTable).set({ status: "pending" }).where(and(
      eq(ordersTable.id, input.orderId),
      eq(ordersTable.merchantId, input.merchantId),
      eq(ordersTable.status, "paid"),
    ));
    await tx.insert(commerceTransitionHistoryTable).values({
      merchantId: input.merchantId,
      orderId: input.orderId,
      paymentIntentId: input.intentId,
      entityType: "payment_intent",
      fromStatus: intent.status,
      toStatus: input.status,
      actorId: "flutterwave_webhook",
      note: input.reason,
    });
    await tx.insert(activityTable).values({
      merchantId: input.merchantId,
      type: "payment_reversed",
      title: `Payment ${input.status.replaceAll("_", " ")}`,
      description: input.reason,
      amount: (input.amountMinor / 100).toFixed(2),
      currency: input.currency,
      tone: "negative",
    });
    return input.status;
  });
}

async function markOrderPaymentDisputed(input: {
  intentId: number;
  merchantId: number;
  orderId: number;
  providerTransactionId: string | null;
  reason: string;
}) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM payment_intents WHERE id=${input.intentId} AND merchant_id=${input.merchantId} FOR UPDATE`);
    const intent = (await tx.select().from(paymentIntentsTable).where(eq(paymentIntentsTable.id, input.intentId)).limit(1))[0];
    if (!intent || intent.status === "disputed") return;
    await tx.update(paymentIntentsTable).set({ status: "disputed" }).where(eq(paymentIntentsTable.id, intent.id));
    const [record] = await tx.select().from(paymentRecordsTable).where(eq(paymentRecordsTable.intentId, intent.id)).limit(1);
    if (record) await tx.update(paymentRecordsTable).set({ status: "disputed", verifiedBy: "flutterwave_dispute", verifiedAt: new Date(), evidenceReference: input.providerTransactionId ?? record.evidenceReference }).where(eq(paymentRecordsTable.id, record.id));
    await tx.insert(commerceTransitionHistoryTable).values({ merchantId: input.merchantId, orderId: input.orderId, paymentIntentId: input.intentId, entityType: "payment_intent", fromStatus: intent.status, toStatus: "disputed", actorId: "flutterwave_webhook", note: input.reason });
  });
  return "disputed" as const;
}

async function processOrderPayment(transaction: ProviderTransaction, eventId: string, rawPayload: ProviderTransaction, intent: OrderIntent) {
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
  for (const [key, expected] of [["merchant_id", merchant.id], ["order_id", order.id], ["customer_id", customer.id]] as const) {
    const observed = metaNumber(metadata, key);
    if (observed !== null && observed !== String(expected)) {
      await recordReconciliationException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: merchant.id, orderId: order.id, paymentIntentId: intent.id, reason: `Flutterwave metadata ${key} does not match TS Commerce`, payload: rawPayload });
      return "reconciliation_required" as const;
    }
  }
  const email = customerEmail(transaction);
  if (!email || email !== customer.email.trim().toLowerCase()) {
    await recordReconciliationException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: merchant.id, orderId: order.id, paymentIntentId: intent.id, reason: "Flutterwave customer email does not match the TS Commerce customer", payload: rawPayload });
    return "reconciliation_required" as const;
  }

  const amount = flutterwaveAmount(transaction as any);
  const observedMinor = Number.isFinite(amount) ? Math.round(amount * 100) : null;
  const currency = text(transaction.currency).toUpperCase();
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
  if (reversal === "refunded" || reversal === "charged_back") {
    return reverseOrderPayment({ intentId: intent.id, merchantId: merchant.id, orderId: order.id, amountMinor: intent.amountMinor, currency: intent.currency, status: reversal, reason: `Flutterwave reported ${reversal} for the transaction`, providerTransactionId: providerId });
  }
  if (reversal === "disputed") {
    return markOrderPaymentDisputed({ intentId: intent.id, merchantId: merchant.id, orderId: order.id, providerTransactionId: providerId, reason: "Flutterwave reported an active dispute; no merchant balance debit was made" });
  }

  const providerState = flutterwaveStatus(transaction as any);
  if (providerState === "failed") {
    await db.transaction(async (tx) => {
      await tx.update(paymentIntentsTable).set({ status: "failed", evidenceReference: reference || intent.evidenceReference }).where(eq(paymentIntentsTable.id, intent.id));
      await tx.update(paymentRecordsTable).set({ status: "failed", evidenceReference: reference || undefined, verifiedBy: "flutterwave_webhook", verifiedAt: new Date() }).where(eq(paymentRecordsTable.intentId, intent.id));
    });
    return "failed" as const;
  }
  if (providerState !== "paid") return "pending" as const;

  const providerFee = providerFeeMinor(transaction);
  const settlementMinor = providerSettlementMinor(transaction);
  const settlementCurrency = providerSettlementCurrency(transaction, currency);
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM payment_intents WHERE id=${intent.id} AND merchant_id=${merchant.id} FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM payment_records WHERE intent_id=${intent.id} AND merchant_id=${merchant.id} FOR UPDATE`);
    const currentIntent = (await tx.select().from(paymentIntentsTable).where(eq(paymentIntentsTable.id, intent.id)).limit(1))[0];
    const currentRecord = (await tx.select().from(paymentRecordsTable).where(eq(paymentRecordsTable.intentId, intent.id)).limit(1))[0];
    if (!currentIntent || !currentRecord) throw new Error("TS Pay payment records are unavailable");
    if (["successful", "verified"].includes(currentIntent.status)) return "duplicate" as const;

    const duplicateProvider = providerId
      ? await tx.execute(sql`SELECT id FROM payment_intents WHERE provider_transaction_id=${providerId} AND id <> ${currentIntent.id} LIMIT 1`)
      : null;
    if (duplicateProvider?.rows.length) throw new Error("This Flutterwave transaction is already linked to another TS Pay payment");

    await tx.update(paymentIntentsTable).set({ status: "successful", evidenceReference: providerId ?? reference }).where(eq(paymentIntentsTable.id, currentIntent.id));
    await tx.update(paymentRecordsTable).set({ status: "successful", evidenceReference: providerId ?? reference, verifiedBy: "flutterwave_webhook", verifiedAt: new Date() }).where(eq(paymentRecordsTable.id, currentRecord.id));
    await tx.execute(sql`UPDATE payment_intents SET provider_transaction_id=${providerId}, provider_event_id=${eventId}, provider_fee_minor=${providerFee}, ts_commerce_fee_minor=${calculateTsCommerceFeeMinor(intent.amountMinor)}, merchant_net_minor=${calculateMerchantNetMinor(intent.amountMinor, providerFee)}, settlement_amount_minor=${settlementMinor}, settlement_currency=${settlementMinor === null ? null : settlementCurrency} WHERE id=${currentIntent.id}`);
    await tx.insert(ledgerEntriesTable).values({ merchantId: merchant.id, orderId: order.id, paymentRecordId: currentRecord.id, amountMinor: intent.amountMinor, currency, entryType: "sale", referenceKey: `payment:${currentIntent.id}` }).onConflictDoNothing({ target: ledgerEntriesTable.referenceKey });
    if (providerFee !== null && providerFee > 0) {
      await tx.insert(ledgerEntriesTable).values({ merchantId: merchant.id, orderId: order.id, paymentRecordId: currentRecord.id, amountMinor: -providerFee, currency, entryType: "fee", referenceKey: `payment:${currentIntent.id}:provider-fee` }).onConflictDoNothing({ target: ledgerEntriesTable.referenceKey });
    }
    const tsFeeMinor = calculateTsCommerceFeeMinor(intent.amountMinor);
    await tx.insert(ledgerEntriesTable).values({ merchantId: merchant.id, orderId: order.id, paymentRecordId: currentRecord.id, amountMinor: -tsFeeMinor, currency, entryType: "fee", referenceKey: `payment:${currentIntent.id}:ts-fee` }).onConflictDoNothing({ target: ledgerEntriesTable.referenceKey });
    await tx.update(ordersTable).set({ status: "paid" }).where(and(eq(ordersTable.id, order.id), eq(ordersTable.merchantId, merchant.id), eq(ordersTable.status, "pending")));
    await tx.insert(commerceTransitionHistoryTable).values({ merchantId: merchant.id, orderId: order.id, paymentIntentId: currentIntent.id, entityType: "payment_intent", fromStatus: currentIntent.status, toStatus: "successful", actorId: "flutterwave_webhook", note: "Provider-verified Flutterwave payment" });
    await tx.insert(activityTable).values({ merchantId: merchant.id, type: "payment_verified", title: "Payment verified", description: "Flutterwave payment was re-queried and verified server-side. Gross sale, actual provider fee (when returned), and TS Commerce 1% fee were recorded separately.", amount: (intent.amountMinor / 100).toFixed(2), currency, tone: "positive" });
    return "successful" as const;
  });
  return result;
}

async function processMarketplaceAdvertisingPayment(
  transaction: ProviderTransaction,
  eventId: string,
  rawPayload: ProviderTransaction,
  intent: NonNullable<Awaited<ReturnType<typeof findIntentByReference>>>,
) {
  if (!intent.marketplaceBillingRecordId) return null;
  const providerId = flutterwaveTransactionId(transaction as any);
  const reference = txRef(transaction);
  const [billing] = await db.select().from(marketplaceBillingRecordsTable)
    .where(eq(marketplaceBillingRecordsTable.id, intent.marketplaceBillingRecordId))
    .limit(1);
  if (!billing) {
    await recordReconciliationException({
      eventId,
      providerTransactionId: providerId,
      paymentReference: reference || null,
      merchantId: intent.merchantId,
      paymentIntentId: intent.id,
      reason: "Marketplace advertising payment is missing its billing record",
      payload: rawPayload,
    });
    return "reconciliation_required" as const;
  }

  const amount = flutterwaveAmount(transaction as any);
  const amountMinor = Number.isFinite(amount) ? Math.round(amount * 100) : null;
  const currency = text(transaction.currency).toUpperCase();
  if (
    amountMinor === null ||
    amountMinor !== Math.round(Number(billing.amount) * 100) ||
    currency !== billing.currency.toUpperCase()
  ) {
    await recordReconciliationException({
      eventId,
      providerTransactionId: providerId,
      paymentReference: reference || null,
      merchantId: billing.merchantId,
      paymentIntentId: intent.id,
      expectedAmountMinor: Math.round(Number(billing.amount) * 100),
      observedAmountMinor: amountMinor,
      expectedCurrency: billing.currency,
      observedCurrency: currency || null,
      reason: "Marketplace advertising payment amount or currency mismatch",
      payload: rawPayload,
    });
    await db.update(paymentIntentsTable).set({ status: "reconciliation_required" }).where(eq(paymentIntentsTable.id, intent.id));
    return "reconciliation_required" as const;
  }

  const metadata = meta(transaction);
  for (const [key, expected] of [["merchant_id", billing.merchantId], ["marketplace_billing_id", billing.id]] as const) {
    const observed = metaNumber(metadata, key);
    if (observed !== null && observed !== String(expected)) {
      await recordReconciliationException({
        eventId,
        providerTransactionId: providerId,
        paymentReference: reference || null,
        merchantId: billing.merchantId,
        paymentIntentId: intent.id,
        reason: `Flutterwave marketplace metadata ${key} does not match TS Commerce`,
        payload: rawPayload,
      });
      return "reconciliation_required" as const;
    }
  }

  const reversal = providerReversal(transaction);
  if (reversal === "refunded" || reversal === "charged_back") {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM payment_intents WHERE id=${intent.id} AND merchant_id=${billing.merchantId} FOR UPDATE`);
      const current = (await tx.select().from(paymentIntentsTable).where(eq(paymentIntentsTable.id, intent.id)).limit(1))[0];
      if (!current || current.status === reversal) return;
      await tx.update(paymentIntentsTable).set({ status: reversal, providerTransactionId: providerId, providerEventId: eventId }).where(eq(paymentIntentsTable.id, intent.id));
      await tx.update(marketplaceBillingRecordsTable).set({ status: "reversed", reviewNote: `Provider reported ${reversal}` }).where(eq(marketplaceBillingRecordsTable.id, billing.id));
      if (billing.listingId) {
        await tx.update(marketplaceListingsTable).set({ listingFeeStatus: "due", updatedAt: new Date() }).where(and(
          eq(marketplaceListingsTable.id, billing.listingId),
          eq(marketplaceListingsTable.merchantId, billing.merchantId),
        ));
      }
      await tx.insert(ledgerEntriesTable).values({
        merchantId: billing.merchantId,
        paymentRecordId: null,
        amountMinor: -Math.round(Number(billing.amount) * 100),
        currency: billing.currency,
        entryType: "marketplace_advertising_refund",
        referenceKey: `marketplace-ad:${billing.id}:refund`,
      }).onConflictDoNothing({ target: ledgerEntriesTable.referenceKey });
    });
    return "reversed" as const;
  }
  if (reversal === "disputed") {
    await db.update(paymentIntentsTable).set({ status: "disputed", providerTransactionId: providerId, providerEventId: eventId }).where(eq(paymentIntentsTable.id, intent.id));
    return "disputed" as const;
  }

  const state = flutterwaveStatus(transaction as any);
  if (state === "failed") {
    await db.update(paymentIntentsTable).set({ status: "failed", providerTransactionId: providerId, providerEventId: eventId }).where(eq(paymentIntentsTable.id, intent.id));
    return "failed" as const;
  }
  if (state !== "paid") {
    await db.update(paymentIntentsTable).set({ status: "pending", providerTransactionId: providerId, providerEventId: eventId }).where(eq(paymentIntentsTable.id, intent.id));
    return "pending" as const;
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM payment_intents WHERE id=${intent.id} AND merchant_id=${billing.merchantId} FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM marketplace_billing_records WHERE id=${billing.id} AND merchant_id=${billing.merchantId} FOR UPDATE`);
    const current = (await tx.select().from(paymentIntentsTable).where(eq(paymentIntentsTable.id, intent.id)).limit(1))[0];
    const currentBilling = (await tx.select().from(marketplaceBillingRecordsTable).where(eq(marketplaceBillingRecordsTable.id, billing.id)).limit(1))[0];
    if (!current || !currentBilling) throw new Error("Marketplace advertising payment state unavailable");
    if (current.status === "successful" || currentBilling.status === "paid") return "duplicate" as const;

    await tx.update(paymentIntentsTable).set({
      status: "successful",
      evidenceReference: providerId ?? reference,
      providerTransactionId: providerId,
      providerEventId: eventId,
    }).where(eq(paymentIntentsTable.id, current.id));

    await tx.update(marketplaceBillingRecordsTable).set({
      status: "paid",
      paymentReference: providerId ?? reference,
      paidAt: new Date(),
      reviewNote: "Verified by Flutterwave transaction re-query",
    }).where(eq(marketplaceBillingRecordsTable.id, currentBilling.id));

    if (currentBilling.listingId) {
      await tx.update(marketplaceListingsTable)
        .set({ listingFeeStatus: "paid", updatedAt: new Date() })
        .where(and(
          eq(marketplaceListingsTable.id, currentBilling.listingId),
          eq(marketplaceListingsTable.merchantId, billing.merchantId),
        ));
    }

    await tx.insert(ledgerEntriesTable).values({
      merchantId: billing.merchantId,
      paymentRecordId: null,
      amountMinor: Math.round(Number(currentBilling.amount) * 100),
      currency: currentBilling.currency,
      entryType: "marketplace_advertising_payment",
      referenceKey: `marketplace-ad:${currentBilling.id}:payment`,
    }).onConflictDoNothing({ target: ledgerEntriesTable.referenceKey });

    await tx.insert(activityTable).values({
      merchantId: billing.merchantId,
      type: "marketplace_advertising_paid",
      title: "Marketplace advertising payment verified",
      description: "The $5 product advertising fee was verified by Flutterwave. The product can now become publicly discoverable after marketplace approval.",
      amount: currentBilling.amount,
      currency: currentBilling.currency,
      tone: "positive",
    });

    return "successful" as const;
  });
}

async function processSubscriptionPayment(transaction: ProviderTransaction, eventId: string, rawPayload: ProviderTransaction, payment: SubscriptionPayment) {
  const providerId = flutterwaveTransactionId(transaction as any);
  const reference = txRef(transaction);
  const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, payment.merchantId)).limit(1);
  const [subscription] = merchant ? await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.merchantId, merchant.id)).limit(1) : [];
  if (!merchant || !subscription) {
    await recordReconciliationException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: payment.merchantId, reason: "Subscription payment is not linked to a merchant subscription", payload: rawPayload });
    return "reconciliation_required" as const;
  }
  const metadata = meta(transaction);
  for (const [key, expected] of [["merchant_id", merchant.id], ["subscription_id", subscription.id]] as const) {
    const observed = metaNumber(metadata, key);
    if (observed !== null && observed !== String(expected)) {
      await recordReconciliationException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: merchant.id, reason: `Flutterwave metadata ${key} does not match TS Commerce`, payload: rawPayload });
      return "reconciliation_required" as const;
    }
  }
  const email = customerEmail(transaction);
  if (!email || email !== merchant.email.trim().toLowerCase()) {
    await recordReconciliationException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: merchant.id, reason: "Flutterwave subscription payment customer does not match the merchant", payload: rawPayload });
    return "reconciliation_required" as const;
  }
  const amount = flutterwaveAmount(transaction as any);
  const amountMinor = Number.isFinite(amount) ? Math.round(amount * 100) : null;
  const expectedMinor = Math.round(Number(payment.amount) * 100);
  const currency = text(transaction.currency).toUpperCase();
  if (amountMinor === null || amountMinor !== expectedMinor || currency !== payment.currency.toUpperCase()) {
    await recordReconciliationException({ eventId, providerTransactionId: providerId, paymentReference: reference || null, merchantId: merchant.id, expectedAmountMinor: expectedMinor, observedAmountMinor: amountMinor, expectedCurrency: payment.currency, observedCurrency: currency || null, reason: "Flutterwave subscription amount or currency mismatch", payload: rawPayload });
    await db.update(paymentsTable).set({ status: "reconciliation_required", reviewNote: "Flutterwave webhook amount/currency mismatch", reviewedBy: "flutterwave_webhook", reviewedAt: new Date() }).where(eq(paymentsTable.id, payment.id));
    return "reconciliation_required" as const;
  }
  const reversal = providerReversal(transaction);
  if (reversal === "refunded" || reversal === "charged_back") {
    const reason = `Flutterwave reported ${reversal} for the subscription payment`;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM payments WHERE id=${payment.id} AND merchant_id=${merchant.id} FOR UPDATE`);
      await tx.execute(sql`SELECT id FROM subscriptions WHERE id=${subscription.id} AND merchant_id=${merchant.id} FOR UPDATE`);
      const current = (await tx.select().from(paymentsTable).where(eq(paymentsTable.id, payment.id)).limit(1))[0];
      const locked = (await tx.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, subscription.id)).limit(1))[0];
      if (!current || !locked || current.status !== "confirmed") return;
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
  if (state !== "paid") {
    await db.update(paymentsTable).set({ status: "pending" }).where(eq(paymentsTable.id, payment.id));
    return "pending" as const;
  }

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM payments WHERE id=${payment.id} AND merchant_id=${merchant.id} FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM subscriptions WHERE id=${subscription.id} AND merchant_id=${merchant.id} FOR UPDATE`);
    const currentPayment = (await tx.select().from(paymentsTable).where(eq(paymentsTable.id, payment.id)).limit(1))[0];
    const currentSubscription = (await tx.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, subscription.id)).limit(1))[0];
    if (!currentPayment || !currentSubscription) throw new Error("Subscription payment state unavailable");
    if (currentPayment.status === "confirmed") return "duplicate" as const;
    const duplicateProvider = providerId ? await tx.execute(sql`SELECT id FROM payments WHERE provider_transaction_id=${providerId} AND id <> ${currentPayment.id} LIMIT 1`) : null;
    if (duplicateProvider?.rows.length) throw new Error("This Flutterwave transaction is already linked to another TS Commerce payment");
    const remaining = Math.max(0, Number(currentSubscription.amountDue) - Number(currentSubscription.amountPaid));
    if (remaining <= 0 || Number(currentPayment.amount) > remaining) throw new Error("Flutterwave subscription payment exceeds the outstanding obligation");

    const nextPaid = Number(currentSubscription.amountPaid) + Number(currentPayment.amount);
    const settled = nextPaid + 0.005 >= Number(currentSubscription.amountDue);
    await tx.update(paymentsTable).set({ status: "confirmed", evidenceReference: providerId ?? reference, reviewedBy: "flutterwave_webhook", reviewedAt: new Date(), reviewNote: "Verified by Flutterwave webhook and transaction re-query" }).where(eq(paymentsTable.id, currentPayment.id));
    const [updatedSubscription] = await tx.update(subscriptionsTable).set({ amountPaid: nextPaid.toFixed(2), paymentMethod: "flutterwave", status: settled ? "active" : "past_due" }).where(and(eq(subscriptionsTable.id, currentSubscription.id), eq(subscriptionsTable.amountPaid, currentSubscription.amountPaid))).returning();
    if (!updatedSubscription) throw new Error("Subscription changed while payment was processing");
    const providerFee = providerFeeMinor(transaction);
    await tx.execute(sql`UPDATE payments SET provider_transaction_id=${providerId}, provider_event_id=${eventId}, provider_fee_minor=${providerFee}, ts_commerce_fee_minor=${calculateTsCommerceFeeMinor(expectedMinor)}, merchant_net_minor=${calculateMerchantNetMinor(expectedMinor, providerFee)} WHERE id=${currentPayment.id}`);
    await qualifyReferralForPayment(tx, { referredMerchantId: merchant.id, paymentId: currentPayment.id, subscription: updatedSubscription, amountMinor: amountMinor!, currency: currentPayment.currency });
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
      observedCurrency: text(transaction.currency).toUpperCase() || null,
      reason: "Flutterwave transaction has no matching TS Pay payment session or subscription payment",
      payload: rawPayload,
    });
    return "reconciliation_required" as const;
  }
  if (intent?.marketplaceBillingRecordId) {
    return processMarketplaceAdvertisingPayment(transaction, eventId, rawPayload, intent);
  }
  if (intent) return processOrderPayment(transaction, eventId, rawPayload, intent);
  return processSubscriptionPayment(transaction, eventId, rawPayload, subscriptionPayment!);
}
