import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { flutterwaveAmount, flutterwaveStatus } from "./flutterwave-client";

type ProviderTransaction = Record<string, unknown>;

function hashEvidence(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Applies an already provider-verified Flutterwave transaction to a product
 * auction settlement. The caller must have performed webhook signature
 * verification and a provider transaction re-query before calling this.
 */
export async function settleVerifiedProductAuctionPayment(transaction: ProviderTransaction) {
  const meta = transaction.meta && typeof transaction.meta === "object" && !Array.isArray(transaction.meta)
    ? transaction.meta as ProviderTransaction
    : {};
  const auctionId = Number(meta.auction_id);
  const bidId = Number(meta.bid_id);
  const transactionId = String(transaction.id ?? "").trim();
  if (!Number.isInteger(auctionId) || auctionId < 1 || !Number.isInteger(bidId) || bidId < 1 || !transactionId) {
    return null;
  }
  if (String(meta.payment_kind ?? "") !== "product_auction") return null;

  const status = flutterwaveStatus(transaction as any);
  const amount = flutterwaveAmount(transaction as any);
  const currency = String(transaction.currency ?? "").toUpperCase();

  return db.transaction(async (tx) => {
    const settlementRows = await tx.execute(sql`
      SELECT id, auction_id, bid_id, amount, currency, tx_ref, status
      FROM product_auction_settlements
      WHERE auction_id = ${auctionId} AND bid_id = ${bidId}
      FOR UPDATE
    `);
    const settlement = settlementRows.rows[0] as Record<string, unknown> | undefined;
    if (!settlement) throw new Error("Auction settlement was not created by Lunavo");

    if (String(settlement.status) === "paid") return { auctionId, bidId, status: "duplicate" as const };

    const providerReference = String(transaction.tx_ref ?? transaction.reference ?? "").trim();
    if (!providerReference || providerReference !== String(settlement.tx_ref)) {
      throw new Error("Provider transaction reference does not match the Lunavo auction settlement");
    }

    if (status === "pending") return { auctionId, bidId, status: "pending" as const };

    if (status === "failed") {
      await tx.execute(sql`
        UPDATE product_auction_settlements
        SET status = 'failed', provider_transaction_id = ${transactionId}, updated_at = now()
        WHERE id = ${Number(settlement.id)} AND status = 'pending'
      `);
      await tx.execute(sql`
        UPDATE auction_listings
        SET status = 'ended', settlement_status = 'failed', updated_at = now()
        WHERE id = ${auctionId} AND status = 'payment_pending'
      `);
      return { auctionId, bidId, status: "failed" as const };
    }

    if (status !== "paid" || !Number.isFinite(amount) || Math.abs(amount - Number(settlement.amount)) > 0.005 || currency !== String(settlement.currency).toUpperCase()) {
      throw new Error("Provider payment amount or currency does not match the auction settlement");
    }

    const winningRows = await tx.execute(sql`
      SELECT id, risk_status FROM auction_bids
      WHERE id = ${bidId} AND auction_id = ${auctionId}
      FOR UPDATE
    `);
    const winningBid = winningRows.rows[0] as Record<string, unknown> | undefined;
    if (!winningBid || String(winningBid.risk_status) !== "accepted") {
      throw new Error("Winning bid is no longer eligible for settlement");
    }

    const updated = await tx.execute(sql`
      UPDATE product_auction_settlements
      SET status = 'paid', provider_transaction_id = ${transactionId}, paid_at = now(), updated_at = now()
      WHERE id = ${Number(settlement.id)} AND status = 'pending'
    `);
    if (updated.rowCount === 0) return { auctionId, bidId, status: "duplicate" as const };

    await tx.execute(sql`
      UPDATE auction_listings
      SET status = 'paid', settlement_status = 'verified', settlement_reference = ${transactionId}, updated_at = now()
      WHERE id = ${auctionId} AND status = 'payment_pending'
    `);
    await tx.execute(sql`
      UPDATE auction_bids
      SET settlement_status = 'paid'
      WHERE id = ${bidId} AND auction_id = ${auctionId}
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

    return { auctionId, bidId, status: "paid" as const };
  });
}
