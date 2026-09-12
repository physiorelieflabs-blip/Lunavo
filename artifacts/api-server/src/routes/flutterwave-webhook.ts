import { createHash } from "node:crypto";
import { Router, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { db, paymentWebhookEventsTable } from "@workspace/db";
import { verifyFlutterwaveTransaction, verifyFlutterwaveWebhookSignature } from "../lib/flutterwave-client";
import { settleVerifiedProductAuctionPayment } from "../lib/product-auction-settlement";
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
  if (!verifyFlutterwaveWebhookSignature(raw, req.header("flutterwave-signature"), req.header("verif-hash"))) { res.status(401).json({ error: "Invalid Flutterwave webhook signature" }); return; }
  let payload: Payload;
  try { const parsed = JSON.parse(raw.toString("utf8")); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid"); payload = parsed as Payload; }
  catch { res.status(400).json({ error: "Invalid Flutterwave webhook JSON" }); return; }

  const data = payloadData(payload); const providerTransactionId = data.id == null ? "" : String(data.id); const eventType = String(payload.event ?? payload.type ?? "unknown");
  const eventId = eventIdFrom(req, payload, providerTransactionId, eventType);
  if (!eventId) { res.status(400).json({ error: "Flutterwave webhook event cannot be identified" }); return; }

  try {
    const inserted = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(paymentWebhookEventsTable).where(and(eq(paymentWebhookEventsTable.provider, "flutterwave"), eq(paymentWebhookEventsTable.webhookId, eventId))).limit(1);
      if (existing) return false;
      await tx.insert(paymentWebhookEventsTable).values({ provider: "flutterwave", webhookId: eventId, eventType, providerPaymentId: providerTransactionId || null, payload, status: "received" });
      return true;
    });
    if (!inserted) { res.status(200).json({ received: true, duplicate: true }); return; }
    if (!providerTransactionId) {
      await db.update(paymentWebhookEventsTable).set({ status: "reconciliation_required", error: "Missing provider transaction id", processedAt: new Date() }).where(and(eq(paymentWebhookEventsTable.provider, "flutterwave"), eq(paymentWebhookEventsTable.webhookId, eventId)));
      res.status(200).json({ received: true, status: "reconciliation_required" }); return;
    }

    // Webhooks are signals only. Re-query Flutterwave, then route auction payments
    // through the same authoritative settlement boundary used by the trusted adapter.
    const verified = await verifyFlutterwaveTransaction(providerTransactionId) as unknown as Payload;
    const auctionOutcome = await settleVerifiedProductAuctionPayment(verified);
    const outcome = auctionOutcome
      ? auctionOutcome.status
      : await processVerifiedFlutterwaveTransaction(verified, eventId, payload);
    await db.update(paymentWebhookEventsTable).set({ status: outcome === "reconciliation_required" ? "reconciliation_required" : "processed", processedAt: new Date() }).where(and(eq(paymentWebhookEventsTable.provider, "flutterwave"), eq(paymentWebhookEventsTable.webhookId, eventId)));
    res.status(200).json({ received: true, status: outcome });
  } catch (error) {
    await db.update(paymentWebhookEventsTable).set({ status: "failed", error: error instanceof Error ? error.message : "Webhook processing failed", processedAt: new Date() }).where(and(eq(paymentWebhookEventsTable.provider, "flutterwave"), eq(paymentWebhookEventsTable.webhookId, eventId)));
    res.status(502).json({ error: "Flutterwave webhook could not be reconciled" });
  }
});
export default router;
