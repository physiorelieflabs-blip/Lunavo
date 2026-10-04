import { createHash } from "node:crypto";
import { Router, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { db, ledgerEntriesTable, paymentWebhookEventsTable, withdrawalsTable } from "@workspace/db";
import { flutterwaveTransferStatus, verifyFlutterwaveTransaction, verifyFlutterwaveTransfer, verifyFlutterwaveWebhookSignatureAsync } from "../lib/flutterwave-client";
import { settleVerifiedProductAuctionPayment } from "../lib/product-auction-settlement";
import { settleVerifiedStoreAuctionPayment } from "../lib/store-auction-settlement";
import { processVerifiedFlutterwaveTransaction } from "./flutterwave-payment-processor";

const router = Router();
type Payload = Record<string, unknown>;
function payloadData(payload: Payload): Payload { const value = payload.data; return value && typeof value === "object" && !Array.isArray(value) ? value as Payload : payload; }
function eventIdFrom(req: Request, payload: Payload, transactionId: string, eventType: string): string | null {
  for (const value of [req.header("flutterwave-event-id"), req.header("x-flutterwave-event-id"), req.header("webhook-id"), req.header("x-webhook-id")]) if (value?.trim()) return value.trim();
  for (const key of ["id", "event_id", "eventId", "webhook_id", "webhookId"]) { const value = payload[key]; if (typeof value === "string" && value.trim()) return value.trim(); if (typeof value === "number" && Number.isFinite(value)) return String(value); }
  if (!transactionId) return null;
  return `derived:${createHash("sha256").update(JSON.stringify({ transactionId, eventType, status: payloadData(payload).status ?? null, refundStatus: payloadData(payload).refund_status ?? null, disputeStatus: payloadData(payload).dispute_status ?? null })).digest("hex")}`;
}

router.post("/webhooks/flutterwave", async (req, res): Promise<void> => {
  const raw = Buffer.isBuffer(req.body) ? req.body : null;
  if (!raw) { res.status(400).json({ error: "Flutterwave webhook body must be received as raw JSON" }); return; }
  if (!(await verifyFlutterwaveWebhookSignatureAsync(raw, req.header("flutterwave-signature"), req.header("verif-hash")))) { res.status(401).json({ error: "Invalid Flutterwave webhook signature" }); return; }
  let payload: Payload;
  try { const parsed = JSON.parse(raw.toString("utf8")); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid"); payload = parsed as Payload; }
  catch { res.status(400).json({ error: "Invalid Flutterwave webhook JSON" }); return; }

  const data = payloadData(payload); const providerTransactionId = data.id == null ? "" : String(data.id); const eventType = String(payload.event ?? payload.type ?? "unknown");
  const eventId = eventIdFrom(req, payload, providerTransactionId, eventType);
  if (!eventId) { res.status(400).json({ error: "Flutterwave webhook event cannot be identified" }); return; }

  try {
    const inserted = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(paymentWebhookEventsTable)
        .where(and(eq(paymentWebhookEventsTable.provider, "flutterwave"), eq(paymentWebhookEventsTable.webhookId, eventId)))
        .limit(1);
      if (existing?.status === "processed") return false;
      if (existing) {
        await tx.update(paymentWebhookEventsTable).set({
          status: "received",
          error: null,
          processedAt: null,
          payload,
          eventType,
          providerPaymentId: providerTransactionId || existing.providerPaymentId,
        }).where(eq(paymentWebhookEventsTable.id, existing.id));
        return true;
      }
      await tx.insert(paymentWebhookEventsTable).values({
        provider: "flutterwave",
        webhookId: eventId,
        eventType,
        providerPaymentId: providerTransactionId || null,
        payload,
        status: "received",
      });
      return true;
    });
    if (!inserted) { res.status(200).json({ received: true, duplicate: true }); return; }
    if (!providerTransactionId) {
      await db.update(paymentWebhookEventsTable).set({ status: "reconciliation_required", error: "Missing provider transaction id", processedAt: new Date() }).where(and(eq(paymentWebhookEventsTable.provider, "flutterwave"), eq(paymentWebhookEventsTable.webhookId, eventId)));
      res.status(200).json({ received: true, status: "reconciliation_required" }); return;
    }

    if (eventType.toLowerCase().includes("transfer")) {
      // Payout webhooks use the transfer API, not the transaction verification API.
      // Re-query Flutterwave and only then mutate the withdrawal ledger.
      const transfer = await verifyFlutterwaveTransfer(providerTransactionId);
      const providerStatus = flutterwaveTransferStatus(transfer);
      const outcome = await db.transaction(async (tx) => {
        const [withdrawal] = await tx.select().from(withdrawalsTable)
          .where(eq(withdrawalsTable.providerPayoutId, providerTransactionId))
          .limit(1);
        if (!withdrawal) return "reconciliation_required";
        await tx.execute(sql`select id from ${withdrawalsTable} where id=${withdrawal.id} for update`);
        const [current] = await tx.select().from(withdrawalsTable)
          .where(eq(withdrawalsTable.id, withdrawal.id))
          .limit(1);
        if (!current) return "reconciliation_required";

        const amountMatches = Math.abs(Number(current.amount) - Number(transfer.amount ?? NaN)) < 0.005;
        const currencyMatches = String(transfer.currency ?? "").toUpperCase() === current.currency.toUpperCase();
        const referenceMatches = !transfer.reference || transfer.reference === current.settlementReference;
        if (!amountMatches || !currencyMatches || !referenceMatches) {
          return "reconciliation_required";
        }
        if (current.status === "paid" || current.status === "rejected") return "processed";

        if (providerStatus === "failed") {
          const [updated] = await tx.update(withdrawalsTable).set({
            status: "rejected",
            providerStatus: "failed",
            providerFailureReason: transfer.complete_message || "Flutterwave payout failed",
            settlementReference: transfer.reference ?? current.settlementReference,
            reviewedAt: current.reviewedAt ?? new Date(),
            settledAt: null,
            paidAt: null,
          }).where(and(eq(withdrawalsTable.id, current.id), eq(withdrawalsTable.status, "approved"))).returning();
          if (!updated) return "processed";
          await tx.insert(ledgerEntriesTable).values({
            merchantId: current.merchantId,
            withdrawalId: current.id,
            amountMinor: Math.round(Number(current.amount) * 100),
            currency: current.currency,
            entryType: "withdrawal_release",
            amountMinor: Math.round(Number(current.amount) * 100),
            referenceKey: `withdrawal:${current.id}:release`,
            description: "Flutterwave payout failed; reserved funds released",
          } as never).onConflictDoNothing();
          return "processed";
        }

        if (providerStatus === "paid") {
          const [updated] = await tx.update(withdrawalsTable).set({
            status: "paid",
            providerStatus: "succeeded",
            providerFailureReason: null,
            settlementReference: transfer.reference ?? current.settlementReference,
            paidAt: new Date(),
            settledAt: new Date(),
          }).where(and(eq(withdrawalsTable.id, current.id), eq(withdrawalsTable.status, "approved"))).returning();
          if (!updated) return "processed";
          await tx.insert(ledgerEntriesTable).values({
            merchantId: current.merchantId,
            withdrawalId: current.id,
            amountMinor: 0,
            currency: current.currency,
            entryType: "withdrawal_paid",
            referenceKey: `withdrawal:${current.id}:paid`,
            description: "Flutterwave confirmed withdrawal settlement",
          } as never).onConflictDoNothing();
        } else {
          await tx.update(withdrawalsTable).set({
            providerStatus: "pending",
            settlementReference: transfer.reference ?? current.settlementReference,
          }).where(and(eq(withdrawalsTable.id, current.id), eq(withdrawalsTable.status, "approved")));
        }
        return "processed";
      });
      await db.update(paymentWebhookEventsTable).set({
        status: outcome === "reconciliation_required" ? "reconciliation_required" : "processed",
        processedAt: new Date(),
      }).where(and(eq(paymentWebhookEventsTable.provider, "flutterwave"), eq(paymentWebhookEventsTable.webhookId, eventId)));
      res.status(200).json({ received: true, status: outcome });
      return;
    }

    // Webhooks are signals only. Re-query Flutterwave, then route store/product
    // auctions through their authoritative settlement boundaries.
    const verified = await verifyFlutterwaveTransaction(providerTransactionId) as unknown as Payload;
    const storeAuctionOutcome = await settleVerifiedStoreAuctionPayment(verified);
    const productAuctionOutcome = storeAuctionOutcome
      ? null
      : await settleVerifiedProductAuctionPayment(verified);
    const outcome = storeAuctionOutcome ?? productAuctionOutcome ?? await processVerifiedFlutterwaveTransaction(verified, eventId, payload);
    await db.update(paymentWebhookEventsTable).set({ status: outcome === "reconciliation_required" ? "reconciliation_required" : "processed", processedAt: new Date() }).where(and(eq(paymentWebhookEventsTable.provider, "flutterwave"), eq(paymentWebhookEventsTable.webhookId, eventId)));
    res.status(200).json({ received: true, status: outcome });
  } catch (error) {
    await db.update(paymentWebhookEventsTable).set({ status: "failed", error: error instanceof Error ? error.message : "Webhook processing failed", processedAt: new Date() }).where(and(eq(paymentWebhookEventsTable.provider, "flutterwave"), eq(paymentWebhookEventsTable.webhookId, eventId)));
    res.status(502).json({ error: "Flutterwave webhook could not be reconciled" });
  }
});
export default router;
