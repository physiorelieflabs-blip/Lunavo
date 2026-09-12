import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { flutterwaveAmount, flutterwaveStatus, flutterwaveTransactionId, type FlutterwaveTransaction } from "./flutterwave-client";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Authoritative store-acquisition settlement boundary.
 * The provider webhook is only a signal; the caller must pass the provider's
 * re-queried transaction. Payment, ownership transfer and the immutable
 * transfer record happen in one database transaction.
 */
export async function settleVerifiedStoreAuctionPayment(transaction: FlutterwaveTransaction): Promise<"paid" | "failed" | "reconciliation_required" | null> {
  const meta = transaction.meta ?? {};
  const auctionId = Number(meta.store_auction_id ?? meta.auction_id);
  const bidId = Number(meta.store_auction_bid_id ?? meta.bid_id);
  const txRef = String(transaction.tx_ref ?? "").trim();
  const providerTransactionId = flutterwaveTransactionId(transaction);
  const status = flutterwaveStatus(transaction);
  if (!Number.isInteger(auctionId) || !Number.isInteger(bidId) || !txRef) return null;
  if (status === "pending") return "reconciliation_required";
  if (!providerTransactionId) return "reconciliation_required";

  return db.transaction(async tx => {
    const auctionResult = await tx.execute(sql`
      SELECT id,storefront_id,seller_merchant_id,currency,status,payment_status,payment_reference
      FROM store_auction_listings WHERE id=${auctionId} FOR UPDATE
    `);
    const auction = auctionResult.rows[0] as Record<string, any> | undefined;
    if (!auction) return "reconciliation_required" as const;

    const bidResult = await tx.execute(sql`
      SELECT id,auction_id,bidder_merchant_id,amount,currency,risk_status
      FROM store_auction_bids WHERE id=${bidId} AND auction_id=${auctionId} FOR UPDATE
    `);
    const bid = bidResult.rows[0] as Record<string, any> | undefined;
    if (!bid || bid.risk_status !== "accepted") return "reconciliation_required" as const;

    const winnerResult = await tx.execute(sql`
      SELECT id,amount FROM store_auction_bids
      WHERE auction_id=${auctionId} AND risk_status='accepted'
      ORDER BY amount DESC,created_at ASC LIMIT 1
    `);
    const winner = winnerResult.rows[0] as Record<string, any> | undefined;
    if (!winner || Number(winner.id) !== bidId) return "reconciliation_required" as const;

    const amount = flutterwaveAmount(transaction);
    const currency = String(transaction.currency ?? "").toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0 || currency !== String(bid.currency).toUpperCase() || Math.abs(amount - Number(bid.amount)) > 0.005) {
      return "reconciliation_required" as const;
    }

    const existing = await tx.execute(sql`
      SELECT id,status FROM store_auction_payment_verifications
      WHERE auction_id=${auctionId} AND bid_id=${bidId} AND provider='flutterwave'
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE
    `);
    const existingRow = existing.rows[0] as Record<string, any> | undefined;

    if (status === "failed") {
      if (existingRow?.status === "verified") return "paid" as const;
      await tx.execute(sql`
        UPDATE store_auction_listings SET payment_status='failed'
        WHERE id=${auctionId} AND payment_status <> 'verified'
      `);
      return "failed" as const;
    }

    const duplicateReference = await tx.execute(sql`
      SELECT id,status,auction_id,bid_id FROM store_auction_payment_verifications
      WHERE provider='flutterwave' AND provider_reference=${providerTransactionId} FOR UPDATE
    `);
    const duplicate = duplicateReference.rows[0] as Record<string, any> | undefined;
    if (duplicate && (Number(duplicate.auction_id) !== auctionId || Number(duplicate.bid_id) !== bidId)) {
      return "reconciliation_required" as const;
    }

    if (existingRow?.status === "verified" && String(auction.payment_status) === "verified" && String(auction.payment_reference) === providerTransactionId) {
      return "paid" as const;
    }

    if (!existingRow) {
      await tx.execute(sql`
        INSERT INTO store_auction_payment_verifications
          (auction_id,bid_id,provider,provider_reference,amount,currency,status,verified_at,evidence_hash)
        VALUES
          (${auctionId},${bidId},'flutterwave',${providerTransactionId},${amount},${currency},'verified',now(),
           ${hash(JSON.stringify({ auctionId,bidId,txRef,providerTransactionId,amount,currency }))})
      `);
    } else if (existingRow.status !== "verified") {
      await tx.execute(sql`
        UPDATE store_auction_payment_verifications
        SET status='verified',amount=${amount},currency=${currency},verified_at=now(),evidence_hash=${hash(JSON.stringify({ auctionId,bidId,txRef,providerTransactionId,amount,currency }))}
        WHERE id=${existingRow.id}
      `);
    }

    const storeResult = await tx.execute(sql`
      SELECT id,merchant_id FROM merchant_storefronts WHERE id=${auction.storefront_id} FOR UPDATE
    `);
    const store = storeResult.rows[0] as Record<string, any> | undefined;
    if (!store || Number(store.merchant_id) !== Number(auction.seller_merchant_id)) return "reconciliation_required" as const;

    // Idempotent ownership transfer: a repeated webhook cannot transfer twice.
    if (String(auction.status) !== "transferred") {
      await tx.execute(sql`
        UPDATE merchant_storefronts SET merchant_id=${bid.bidder_merchant_id},updated_at=now()
        WHERE id=${auction.storefront_id} AND merchant_id=${auction.seller_merchant_id}
      `);
      await tx.execute(sql`
        UPDATE merchant_storefront_domains SET merchant_id=${bid.bidder_merchant_id}
        WHERE storefront_id=${auction.storefront_id}
      `);
      await tx.execute(sql`
        INSERT INTO store_ownership_transfers
          (storefront_id,from_merchant_id,to_merchant_id,auction_id,reason,payment_reference)
        VALUES
          (${auction.storefront_id},${auction.seller_merchant_id},${bid.bidder_merchant_id},${auctionId},'store auction acquisition - verified payment',${providerTransactionId})
        ON CONFLICT DO NOTHING
      `);
      await tx.execute(sql`
        UPDATE store_auction_listings
        SET status='transferred',winning_bid_id=${bidId},payment_status='verified',payment_reference=${providerTransactionId},closed_at=COALESCE(closed_at,now()),transferred_at=now()
        WHERE id=${auctionId}
      `);
    }
    return "paid" as const;
  });
}
