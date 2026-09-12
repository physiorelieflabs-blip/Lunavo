import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  flutterwaveAmount,
  flutterwaveStatus,
  initializeFlutterwavePayment,
  verifyFlutterwaveTransaction,
} from "../lib/flutterwave-client";

const router = Router();

function normalizedEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function hashEvidence(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function secretMatches(provided: string | undefined, configured: string | undefined): boolean {
  if (!provided || !configured) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Creates the only supported product-auction payment handoff. The client may
 * request checkout for its own winning bid, but cannot choose the amount,
 * currency, merchant, tx_ref, or payment destination.
 */
router.post("/auctions/:id/settlement/checkout", async (req, res): Promise<void> => {
  const auctionId = Number(req.params.id);
  const bidId = Number(req.body?.bidId);
  const email = normalizedEmail(req.body?.email);
  if (!Number.isInteger(auctionId) || auctionId < 1 || !Number.isInteger(bidId) || bidId < 1 || !email) {
    res.status(400).json({ error: "Auction, winning bid, and bidder email are required" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT a.id, a.merchant_id, a.title, a.currency, a.status, a.ends_at,
               b.id AS bid_id, b.bidder_name, lower(b.bidder_email) AS bidder_email,
               b.amount AS bid_amount, b.risk_status
        FROM auction_listings a
        JOIN auction_bids b ON b.auction_id = a.id
        WHERE a.id = ${auctionId} AND b.id = ${bidId}
        FOR UPDATE OF a, b
      `);
      const row = rows.rows[0] as Record<string, unknown> | undefined;
      if (!row) throw Object.assign(new Error("Auction or bid not found"), { status: 404 });
      if (String(row.risk_status) !== "accepted") throw Object.assign(new Error("This bid is not eligible for settlement"), { status: 409 });
      if (normalizedEmail(row.bidder_email) !== email) throw Object.assign(new Error("Bidder identity does not match the winning bid"), { status: 403 });
      if (String(row.status) !== "ended") throw Object.assign(new Error("The auction has not been closed for settlement"), { status: 409 });

      const winner = await tx.execute(sql`
        SELECT id FROM auction_bids
        WHERE auction_id = ${auctionId} AND risk_status = 'accepted'
        ORDER BY amount DESC, id DESC LIMIT 1
      `);
      if (Number((winner.rows[0] as { id?: number } | undefined)?.id) !== bidId) {
        throw Object.assign(new Error("Only the current winning bid can enter settlement"), { status: 409 });
      }

      const existing = await tx.execute(sql`
        SELECT id, tx_ref, checkout_url, status, amount, currency
        FROM product_auction_settlements
        WHERE auction_id = ${auctionId} AND bid_id = ${bidId}
          AND status IN ('pending','paid')
        ORDER BY id DESC LIMIT 1
      `);
      if (existing.rows[0]) return existing.rows[0] as Record<string, unknown>;

      const txRef = `LUNAVO-AUC-${auctionId}-${bidId}-${randomUUID().replaceAll("-", "").slice(0, 18).toUpperCase()}`;
      const amount = Number(row.bid_amount);
      const currency = String(row.currency).toUpperCase();
      const customerName = String(row.bidder_name || "Lunavo Buyer");
      const redirectUrl = process.env.LUNAVO_AUCTION_PAYMENT_REDIRECT_URL?.trim();
      if (!redirectUrl) throw Object.assign(new Error("Auction payment redirect is not configured"), { status: 503 });

      const checkout = await initializeFlutterwavePayment({
        txRef,
        amount,
        currency,
        redirectUrl,
        customer: { email, name: customerName },
        title: `Lunavo Auction: ${String(row.title)}`,
        meta: { auction_id: auctionId, bid_id: bidId, payment_kind: "product_auction" },
      });

      const inserted = await tx.execute(sql`
        INSERT INTO product_auction_settlements
          (auction_id, bid_id, bidder_email, amount, currency, tx_ref, provider, checkout_url, status)
        VALUES
          (${auctionId}, ${bidId}, ${email}, ${amount.toFixed(2)}, ${currency}, ${checkout.txRef}, 'flutterwave', ${checkout.link}, 'pending')
        RETURNING id, tx_ref, checkout_url, status, amount, currency
      `);
      await tx.execute(sql`
        UPDATE auction_listings
        SET status = 'payment_pending', updated_at = now()
        WHERE id = ${auctionId} AND status = 'ended'
      `);
      return inserted.rows[0] as Record<string, unknown>;
    });

    res.status(201).json({
      auctionId,
      bidId,
      status: String(result.status),
      amount: Number(result.amount),
      currency: String(result.currency),
      txRef: String(result.tx_ref),
      checkoutUrl: String(result.checkout_url),
    });
  } catch (error) {
    const status = Number((error as { status?: number }).status) || 500;
    res.status(status).json({ error: error instanceof Error ? error.message : "Unable to create auction checkout" });
  }
});

/**
 * Trusted payment adapter boundary. Flutterwave webhook processing may call
 * this endpoint only after provider signature verification and transaction
 * re-query. It is deliberately not exposed as a browser payment-success API.
 */
router.post("/internal/auctions/:id/settlement/verify", async (req, res): Promise<void> => {
  const secret = process.env.LUNAVO_AUCTION_PAYMENT_WEBHOOK_SECRET;
  if (!secretMatches(req.get("x-lunavo-payment-secret"), secret)) {
    res.status(401).json({ error: "Unauthorized payment verification request" });
    return;
  }
  const auctionId = Number(req.params.id);
  const transactionId = String(req.body?.transactionId ?? "").trim();
  if (!Number.isInteger(auctionId) || auctionId < 1 || !transactionId) {
    res.status(400).json({ error: "Auction and provider transaction ID are required" });
    return;
  }

  try {
    const transaction = await verifyFlutterwaveTransaction(transactionId);
    const status = flutterwaveStatus(transaction);
    const amount = flutterwaveAmount(transaction);
    const currency = String(transaction.currency ?? "").toUpperCase();
    const meta = transaction.meta ?? {};
    const bidId = Number(meta.bid_id);
    const transactionAuctionId = Number(meta.auction_id);
    if (transactionAuctionId !== auctionId || !Number.isInteger(bidId) || bidId < 1) {
      res.status(409).json({ error: "Provider transaction metadata does not match the auction" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const settlementRows = await tx.execute(sql`
        SELECT id, auction_id, bid_id, amount, currency, tx_ref, status
        FROM product_auction_settlements
        WHERE auction_id = ${auctionId} AND bid_id = ${bidId}
        FOR UPDATE
      `);
      const settlement = settlementRows.rows[0] as Record<string, unknown> | undefined;
      if (!settlement) throw Object.assign(new Error("Auction settlement was not created by Lunavo"), { status: 404 });
      if (String(settlement.status) === "paid") return { status: "duplicate" };

      if (status === "pending") return { status: "pending" };
      if (status === "failed") {
        await tx.execute(sql`
          UPDATE product_auction_settlements
          SET status = 'failed', provider_transaction_id = ${transactionId}, updated_at = now()
          WHERE id = ${Number(settlement.id)}
        `);
        return { status: "failed" };
      }

      if (status !== "paid" || Math.abs(amount - Number(settlement.amount)) > 0.005 || currency !== String(settlement.currency).toUpperCase()) {
        throw Object.assign(new Error("Provider payment amount or currency does not match the auction settlement"), { status: 409 });
      }

      const winningRows = await tx.execute(sql`
        SELECT id, risk_status FROM auction_bids
        WHERE id = ${bidId} AND auction_id = ${auctionId}
        FOR UPDATE
      `);
      if (!winningRows.rows[0] || String((winningRows.rows[0] as Record<string, unknown>).risk_status) !== "accepted") {
        throw Object.assign(new Error("Winning bid is no longer eligible for settlement"), { status: 409 });
      }

      await tx.execute(sql`
        UPDATE product_auction_settlements
        SET status = 'paid', provider_transaction_id = ${transactionId}, paid_at = now(),
            updated_at = now()
        WHERE id = ${Number(settlement.id)} AND status = 'pending'
      `);
      await tx.execute(sql`
        UPDATE auction_listings
        SET status = 'paid', updated_at = now()
        WHERE id = ${auctionId} AND status = 'payment_pending'
      `);
      await tx.execute(sql`
        INSERT INTO domain_events
          (id, merchant_id, event_type, aggregate_type, aggregate_id, actor_type, actor_id,
           source, idempotency_key, payload, context, status)
        SELECT gen_random_uuid(), a.merchant_id, 'auction.payment_verified', 'auction',
               a.id::text, 'system', NULL, 'flutterwave',
               ${`product-auction-payment:${transactionId}`},
               ${JSON.stringify({ auctionId, bidId, providerTransactionId: transactionId, amount, currency, evidenceHash: hashEvidence(transaction) })}::jsonb,
               '{}'::jsonb, 'pending'
        FROM auction_listings a WHERE a.id = ${auctionId}
        ON CONFLICT DO NOTHING
      `);
      return { status: "paid" };
    });

    res.json({ auctionId, bidId, providerTransactionId: transactionId, status: result.status });
  } catch (error) {
    const status = Number((error as { status?: number }).status) || 500;
    res.status(status).json({ error: error instanceof Error ? error.message : "Auction payment verification failed" });
  }
});

export default router;
