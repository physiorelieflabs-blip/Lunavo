import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { flutterwaveAmount, flutterwaveStatus, flutterwaveTransactionId, type FlutterwaveTransaction } from "./flutterwave-client";

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

/** Provider verification is the only authority that can confirm acquisition. */
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
    const auctionResult = await tx.execute(sql`SELECT id,storefront_id,seller_merchant_id,currency,status,payment_status,payment_reference FROM store_auction_listings WHERE id=${auctionId} FOR UPDATE`);
    const auction = auctionResult.rows[0] as Record<string, any> | undefined;
    if (!auction || String(auction.payment_reference ?? "") !== txRef) return "reconciliation_required" as const;

    const bidResult = await tx.execute(sql`SELECT id,auction_id,bidder_merchant_id,amount,currency,risk_status FROM store_auction_bids WHERE id=${bidId} AND auction_id=${auctionId} FOR UPDATE`);
    const bid = bidResult.rows[0] as Record<string, any> | undefined;
    if (!bid || bid.risk_status !== "accepted") return "reconciliation_required" as const;
    const winnerResult = await tx.execute(sql`SELECT id FROM store_auction_bids WHERE auction_id=${auctionId} AND risk_status='accepted' ORDER BY amount DESC,created_at ASC LIMIT 1`);
    const winner = winnerResult.rows[0] as { id?: number } | undefined;
    if (!winner || Number(winner.id) !== bidId) return "reconciliation_required" as const;

    const amount = flutterwaveAmount(transaction);
    const currency = String(transaction.currency ?? "").toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0 || currency !== String(bid.currency).toUpperCase() || Math.abs(amount - Number(bid.amount)) > 0.005) return "reconciliation_required" as const;

    const grossMinor = Math.round(amount * 100);
    const lunavoFeeMinor = Math.floor(grossMinor * 0.01);
    const rawProviderFee = (transaction as Record<string, unknown>).app_fee;
    const parsedProviderFee = rawProviderFee == null || rawProviderFee === "" ? 0 : Number(rawProviderFee);
    if (!Number.isFinite(parsedProviderFee) || parsedProviderFee < 0) return "reconciliation_required" as const;
    const providerFeeMinor = Math.round(parsedProviderFee * 100);
    const sellerNetMinor = grossMinor - lunavoFeeMinor - providerFeeMinor;
    if (sellerNetMinor < 0) return "reconciliation_required" as const;

    const duplicateReference = await tx.execute(sql`SELECT id,status,auction_id,bid_id FROM store_auction_payment_verifications WHERE provider='flutterwave' AND provider_reference=${providerTransactionId} FOR UPDATE`);
    const duplicate = duplicateReference.rows[0] as Record<string, any> | undefined;
    if (duplicate && (Number(duplicate.auction_id) !== auctionId || Number(duplicate.bid_id) !== bidId)) return "reconciliation_required" as const;

    const existing = await tx.execute(sql`SELECT id,status FROM store_auction_payment_verifications WHERE auction_id=${auctionId} AND bid_id=${bidId} AND provider='flutterwave' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`);
    const existingRow = existing.rows[0] as Record<string, any> | undefined;
    if (status === "failed") {
      if (existingRow?.status === "verified") return "paid" as const;
      await tx.execute(sql`UPDATE store_auction_listings SET payment_status='failed' WHERE id=${auctionId} AND payment_status <> 'verified'`);
      await tx.execute(sql`UPDATE lunavo_dashboard_transactions SET status='failed',verification_state='reversed',updated_at=now() WHERE idempotency_key=${`store-auction-sale:${auctionId}:${bidId}`}`);
      return "failed" as const;
    }

    if (!existingRow) {
      await tx.execute(sql`INSERT INTO store_auction_payment_verifications (auction_id,bid_id,provider,provider_reference,amount,currency,status,verified_at,evidence_hash) VALUES (${auctionId},${bidId},'flutterwave',${providerTransactionId},${amount},${currency},'verified',now(),${hash(JSON.stringify({auctionId,bidId,txRef,providerTransactionId,amount,currency}))})`);
    } else if (existingRow.status !== "verified") {
      await tx.execute(sql`UPDATE store_auction_payment_verifications SET status='verified',amount=${amount},currency=${currency},verified_at=now(),evidence_hash=${hash(JSON.stringify({auctionId,bidId,txRef,providerTransactionId,amount,currency}))} WHERE id=${existingRow.id}`);
    }

    const storeResult = await tx.execute(sql`SELECT id,merchant_id FROM merchant_storefronts WHERE id=${auction.storefront_id} FOR UPDATE`);
    const store = storeResult.rows[0] as Record<string, any> | undefined;
    if (!store || Number(store.merchant_id) !== Number(auction.seller_merchant_id)) return "reconciliation_required" as const;

    // TS Pay ledger: record gross sale once, then separately debit actual
    // provider/platform fees. This prevents fee double-counting.
    const sellerSaleKey = `store-auction-sale:${auctionId}:${bidId}`;
    const lunavoFeeKey = `store-auction-lunavo-fee:${auctionId}:${bidId}`;
    const providerFeeKey = `store-auction-provider-fee:${auctionId}:${bidId}`;
    await tx.execute(sql`INSERT INTO ledger_entries (merchant_id,amount_minor,currency,entry_type,reference_key) VALUES (${auction.seller_merchant_id},${grossMinor},${currency},'sale',${sellerSaleKey}) ON CONFLICT (reference_key) DO NOTHING`);
    if (lunavoFeeMinor > 0) await tx.execute(sql`INSERT INTO ledger_entries (merchant_id,amount_minor,currency,entry_type,reference_key) VALUES (${auction.seller_merchant_id},${-lunavoFeeMinor},${currency},'fee',${lunavoFeeKey}) ON CONFLICT (reference_key) DO NOTHING`);
    if (providerFeeMinor > 0) await tx.execute(sql`INSERT INTO ledger_entries (merchant_id,amount_minor,currency,entry_type,reference_key) VALUES (${auction.seller_merchant_id},${-providerFeeMinor},${currency},'fee',${providerFeeKey}) ON CONFLICT (reference_key) DO NOTHING`);

    await tx.execute(sql`INSERT INTO lunavo_dashboard_transactions (merchant_id,counterparty_merchant_id,transaction_type,transaction_kind,status,amount_minor,currency,lunavo_fee_minor,provider_fee_minor,merchant_net_minor,provider,provider_reference,internal_reference,idempotency_key,source,verification_state,verified_at,metadata) VALUES (${auction.seller_merchant_id},${bid.bidder_merchant_id},'store_auction_sale','auction_acquisition','confirmed',${grossMinor},${currency},${lunavoFeeMinor},${providerFeeMinor},${sellerNetMinor},'flutterwave',${providerTransactionId},${`STORE-AUC-SALE-${auctionId}-${bidId}`},${`store-auction-sale:${auctionId}:${bidId}`},'ts_pay','verified',now(),${JSON.stringify({auctionId,bidId,txRef,providerTransactionId,role:'seller',sellerNetMinor})}::jsonb) ON CONFLICT (idempotency_key) DO UPDATE SET status='confirmed',verification_state='verified',verified_at=now(),provider_reference=EXCLUDED.provider_reference,merchant_net_minor=EXCLUDED.merchant_net_minor,updated_at=now()`);

    // The buyer's provider payment is also represented in their dashboard, but
    // it is not treated as a credit/debit against an internal balance.
    await tx.execute(sql`INSERT INTO lunavo_dashboard_transactions (merchant_id,counterparty_merchant_id,transaction_type,transaction_kind,status,amount_minor,currency,lunavo_fee_minor,provider_fee_minor,merchant_net_minor,provider,provider_reference,internal_reference,idempotency_key,source,verification_state,verified_at,metadata) VALUES (${bid.bidder_merchant_id},${auction.seller_merchant_id},'store_auction_acquisition','auction_acquisition','confirmed',${grossMinor},${currency},0,${providerFeeMinor},${-grossMinor},'flutterwave',${providerTransactionId},${`STORE-AUC-BUY-${auctionId}-${bidId}`},${`store-auction-buyer:${auctionId}:${bidId}`},'ts_pay','verified',now(),${JSON.stringify({auctionId,bidId,txRef,providerTransactionId,role:'buyer'})}::jsonb) ON CONFLICT (idempotency_key) DO NOTHING`);

    if (String(auction.status) !== "transferred") {
      await tx.execute(sql`UPDATE merchant_storefronts SET merchant_id=${bid.bidder_merchant_id},updated_at=now() WHERE id=${auction.storefront_id} AND merchant_id=${auction.seller_merchant_id}`);
      await tx.execute(sql`UPDATE merchant_storefront_domains SET merchant_id=${bid.bidder_merchant_id} WHERE storefront_id=${auction.storefront_id}`);
      await tx.execute(sql`INSERT INTO store_ownership_transfers (storefront_id,from_merchant_id,to_merchant_id,auction_id,reason,payment_reference) VALUES (${auction.storefront_id},${auction.seller_merchant_id},${bid.bidder_merchant_id},${auctionId},'store auction acquisition - TS Pay verified provider payment',${providerTransactionId}) ON CONFLICT DO NOTHING`);
      await tx.execute(sql`UPDATE store_auction_listings SET status='transferred',winning_bid_id=${bidId},payment_status='verified',payment_reference=${txRef},closed_at=COALESCE(closed_at,now()),transferred_at=now() WHERE id=${auctionId}`);
    }
    return "paid" as const;
  });
}
