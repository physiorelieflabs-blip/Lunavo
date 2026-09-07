import { randomUUID } from "node:crypto";
import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  db,
  ledgerEntriesTable,
  merchantsTable,
  paymentIntentsTable,
  paymentsTable,
  subscriptionsTable,
} from "@workspace/db";
import { PaySubscriptionFromEarningsResponse } from "@workspace/api-zod";
import { processVerifiedFlutterwaveTransaction } from "./flutterwave-webhook";
import { verifyFlutterwaveTransaction } from "../lib/flutterwave-client";
import {
  ensureReferralPeriodForPaidSubscription,
  qualifyReferralForPayment,
  rollSubscriptionPeriod,
} from "../lib/referrals";

const router = Router();

router.post("/payments/:id/verify", async (req, res, next): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return next();

  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [merchant] = await db
    .select({ id: merchantsTable.id, clerkUserId: merchantsTable.clerkUserId })
    .from(merchantsTable)
    .where(eq(merchantsTable.clerkUserId, auth.userId))
    .limit(1);
  if (!merchant) return next();

  const [intent] = await db
    .select()
    .from(paymentIntentsTable)
    .where(and(eq(paymentIntentsTable.id, id), eq(paymentIntentsTable.merchantId, merchant.id)))
    .limit(1);
  if (!intent || intent.method !== "flutterwave") return next();

  const transactionId = typeof req.body?.transaction_id === "string"
    ? req.body.transaction_id.trim()
    : typeof req.body?.transactionId === "string"
      ? req.body.transactionId.trim()
      : "";
  if (!transactionId) {
    res.status(400).json({ error: "Flutterwave transaction ID is required; local/frontend success flags cannot verify payment" });
    return;
  }

  try {
    const transaction = await verifyFlutterwaveTransaction(transactionId);
    const outcome = await processVerifiedFlutterwaveTransaction(
      transaction as unknown as Record<string, unknown>,
      `manual-verify:${id}:${transactionId}:${randomUUID()}`,
      { source: "manual_verify_endpoint", paymentIntentId: id, transactionId },
    );
    const refreshed = (await db.select().from(paymentIntentsTable).where(eq(paymentIntentsTable.id, id)).limit(1))[0];
    res.json({
      id,
      status: refreshed?.status ?? outcome,
      provider: "flutterwave",
      providerTransactionId: transactionId,
      outcome,
      message:
        outcome === "successful" || outcome === "duplicate"
          ? "Flutterwave payment was verified server-side."
          : outcome === "pending"
            ? "Flutterwave has not confirmed payment yet."
            : outcome === "reconciliation_required"
              ? "Payment could not be matched safely and was sent to reconciliation."
              : "Flutterwave did not confirm the payment.",
    });
  } catch (error) {
    req.log.warn({ err: error, paymentIntentId: id }, "Provider payment verification failed");
    res.status(502).json({ error: error instanceof Error ? error.message : "Flutterwave payment could not be verified" });
  }
});

router.post("/subscription/use-earnings", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.clerkUserId, auth.userId)).limit(1);
  if (!merchant) {
    res.status(404).json({ error: "Merchant account not found" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM merchants WHERE id=${merchant.id} FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM subscriptions WHERE merchant_id=${merchant.id} FOR UPDATE`);
    let subscription = (await tx.select().from(subscriptionsTable).where(eq(subscriptionsTable.merchantId, merchant.id)).limit(1))[0];
    if (!subscription) throw new Error("Subscription not found");
    subscription = await rollSubscriptionPeriod(tx, merchant.id, subscription);

    const outstanding = Math.max(0, Number(subscription.amountDue) - Number(subscription.amountPaid));
    const held = Math.max(0, Number(subscription.earningsHeld));
    const applied = Math.min(held, outstanding);
    if (applied <= 0) {
      if (outstanding <= 0) throw new Error("Subscription is already settled");
      throw new Error("No eligible held earnings are currently available for the subscription");
    }

    const amountMinor = Math.round(applied * 100);
    const reference = `EARN-SUB-${subscription.id}-${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;
    const nextPaid = Number(subscription.amountPaid) + applied;
    const settled = nextPaid + 0.005 >= Number(subscription.amountDue);
    const nextHeld = Math.max(0, held - applied);

    const [updatedSubscription] = await tx.update(subscriptionsTable).set({
      amountPaid: nextPaid.toFixed(2),
      earningsHeld: nextHeld.toFixed(2),
      paymentMethod: "earnings",
      paymentMethodSelectedAt: subscription.paymentMethodSelectedAt ?? new Date(),
      status: settled ? "active" : "past_due",
    }).where(and(
      eq(subscriptionsTable.id, subscription.id),
      eq(subscriptionsTable.amountPaid, subscription.amountPaid),
      eq(subscriptionsTable.earningsHeld, subscription.earningsHeld),
    )).returning();
    if (!updatedSubscription) throw new Error("Subscription changed while earnings payment was processing");

    const [payment] = await tx.insert(paymentsTable).values({
      merchantId: merchant.id,
      amount: applied.toFixed(2),
      currency: subscription.currency,
      method: "earnings",
      reference,
      status: "confirmed",
      reviewedBy: "ts_pay",
      reviewNote: "Internal TS Pay earnings allocation; no external payment destination used",
      reviewedAt: new Date(),
    }).returning();
    if (!payment) throw new Error("Subscription earnings payment could not be recorded");

    // This debit is an internal accounting movement, not a bank movement.
    await tx.insert(ledgerEntriesTable).values({
      merchantId: merchant.id,
      paymentRecordId: null,
      amountMinor: -amountMinor,
      currency: subscription.currency,
      entryType: "fee",
      referenceKey: `subscription-earnings:${payment.id}`,
    }).onConflictDoNothing({ target: ledgerEntriesTable.referenceKey });

    if (settled) {
      await tx.update(merchantsTable).set({ status: "active" }).where(and(
        eq(merchantsTable.id, merchant.id),
        eq(merchantsTable.status, "suspended"),
      ));
    }
    await qualifyReferralForPayment(tx, {
      referredMerchantId: merchant.id,
      paymentId: payment.id,
      subscription: updatedSubscription,
      amountMinor,
      currency: subscription.currency,
    });
    if (settled) await ensureReferralPeriodForPaidSubscription(tx, merchant.id, updatedSubscription);

    return { payment, subscription: updatedSubscription };
  });

  res.status(201).json(PaySubscriptionFromEarningsResponse.parse({
    id: result.payment.id,
    merchantName: merchant.name,
    amount: Number(result.payment.amount),
    currency: result.payment.currency,
    method: result.payment.method,
    reference: result.payment.reference,
    senderName: result.payment.senderName,
    status: result.payment.status,
    reviewNote: result.payment.reviewNote,
    reviewedAt: result.payment.reviewedAt,
    createdAt: result.payment.createdAt,
  }));
});

export default router;
