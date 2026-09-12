import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { flutterwaveAmount, flutterwaveStatus } from "./flutterwave-client";

type ProviderTransaction = Record<string, unknown>;
function hashEvidence(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

/** Applies an already provider-verified Flutterwave transaction to an auction settlement. */
export async function settleVerifiedProductAuctionPayment(transaction: ProviderTransaction) {
  const meta = transaction.meta && typeof transaction.meta === "object" && !Array.isArray(transaction.meta) ? transaction.meta as ProviderTransaction : {};
  const auctionId = Number(meta.auction_id);
  const bidId = Number(meta.bid_id);
  const transactionId = String(transaction.id ?? "").trim();
  if (!Number.isInteger(auctionId) || auctionId < 1 || !Number.isInteger(bidId) || bidId < 1 || !transactionId) return null;
  if (String(meta.payment_kind ?? "") !== "product_auction") return null;

  const status = flutterwaveStatus(transaction as any);
  const amount = flutterwaveAmount(transaction as any);
  const currency = String(transaction.currency ?? "").toUpperCase();

  return db.transaction(async (tx) => {
    const settlementRows = await tx.execute(sql`SELECT id,auction_id,bid_id,amount,currency,tx_ref,status FROM product_auction_settlements WHERE auction_id=${auctionId} AND bid_id=${bidId} FOR UPDATE`);
    const settlement = settlementRows.rows[0] as Record<string, unknown> | undefined;
    if (!settlement) throw new Error("Auction settlement was not created by Lunavo");
    if (String(settlement.status) === "paid") return { auctionId, bidId, status: "duplicate" as const };

    const providerReference = String(transaction.tx_ref ?? transaction.reference ?? "").trim();
    if (!providerReference || providerReference !== String(settlement.tx_ref)) throw new Error("Provider transaction reference does not match the Lunavo auction settlement");
    if (status === "pending") return { auctionId, bidId, status: "pending" as const };

    if (status === "failed") {
      await tx.execute(sql`UPDATE product_auction_settlements SET status='failed',provider_transaction_id=${transactionId},updated_at=now() WHERE id=${Number(settlement.id)} AND status='pending'`);
      await tx.execute(sql`UPDATE auction_listings SET status='ended',settlement_status='failed',updated_at=now() WHERE id=${auctionId} AND status='payment_pending'`);
      return { auctionId, bidId, status: "failed" as const };
    }
    if (status !== "paid" || !Number.isFinite(amount) || Math.abs(amount - Number(settlement.amount)) > 0.005 || currency !== String(settlement.currency).toUpperCase()) throw new Error("Provider payment amount or currency does not match the auction settlement");

    const winningRows = await tx.execute(sql`SELECT id,risk_status FROM auction_bids WHERE id=${bidId} AND auction_id=${auctionId} FOR UPDATE`);
    const winningBid = winningRows.rows[0] as Record<string, unknown> | undefined;
    if (!winningBid || String(winningBid.risk_status) !== "accepted") throw new Error("Winning bid is no longer eligible for settlement");

    const auctionRows = await tx.execute(sql`SELECT merchant_id FROM auction_listings WHERE id=${auctionId} FOR UPDATE`);
    const auction = auctionRows.rows[0] as { merchant_id?: number } | undefined;
    if (!auction?.merchant_id) throw new Error("Auction seller could not be resolved");

    const updated = await tx.execute(sql`UPDATE product_auction_settlements SET status='paid',provider_transaction_id=${transactionId},paid_at=now(),updated_at=now() WHERE id=${Number(settlement.id)} AND status='pending'`);
    if (updated.rowCount === 0) return { auctionId, bidId, status: "duplicate" as const };

    const grossMinor = Math.round(amount * 100);
    const lunavoFeeMinor = Math.floor(grossMinor * 0.01);
    const rawProviderFee = transaction.app_fee;
    const providerFee = rawProviderFee == null || rawProviderFee === "" ? 0 : Number(rawProviderFee);
    if (!Number.isFinite(providerFee) || providerFee < 0) throw new Error("Invalid provider fee returned by Flutterwave");
    const providerFeeMinor = Math.round(providerFee * 100);
    const sellerNetMinor = grossMinor - lunavoFeeMinor - providerFeeMinor;
    if (sellerNetMinor < 0) throw new Error("Provider/platform fees exceed auction proceeds");

    // One authoritative seller sale, followed by the actual platform/provider
    // deductions. The dashboard is projected from this ledger activity.
    await tx.execute(sql`INSERT INTO ledger_entries (merchant_id,amount_minor,currency,entry_type,reference_key) VALUES (${auction.merchant_id},${grossMinor},${currency},'sale',${`product-auction:${auctionId}:${bidId}:sale`}) ON CONFLICT (reference_key) DO NOTHING`);
    if (lunavoFeeMinor > 0) await tx.execute(sql`INSERT INTO ledger_entries (merchant_id,amount_minor,currency,entry_type,reference_key) VALUES (${auction.merchant_id},${-lunavoFeeMinor},${currency},'fee',${`product-auction:${auctionId}:${bidId}:lunavo-fee`}) ON CONFLICT (reference_key) DO NOTHING`);
    if (providerFeeMinor > 0) await tx.execute(sql`INSERT INTO ledger_entries (merchant_id,amount_minor,currency,entry_type,reference_key) VALUES (${auction.merchant_id},${-providerFeeMinor},${currency},'fee',${`product-auction:${auctionId}:${bidId}:provider-fee`}) ON CONFLICT (reference_key) DO NOTHING`);

    await tx.execute(sql`INSERT INTO lunavo_dashboard_transactions (merchant_id,transaction_type,transaction_kind,status,amount_minor,currency,lunavo_fee_minor,provider_fee_minor,merchant_net_minor,provider,provider_reference,internal_reference,idempotency_key,source,verification_state,verified_at,metadata) VALUES (${auction.merchant_id},'product_auction_sale','sale','confirmed',${grossMinor},${currency},${lunavoFeeMinor},${providerFeeMinor},${sellerNetMinor},'flutterwave',${transactionId},${`PRODUCT-AUC-${auctionId}-${bidId}`},${`product-auction:${auctionId}:${bidId}`},'ts_pay','verified',now(),${JSON.stringify({auctionId,bidId,providerTransactionId:transactionId,providerReference,role:'seller',sellerNetMinor})}::jsonb) ON CONFLICT (idempotency_key) DO UPDATE SET status='confirmed',verification_state='verified',verified_at=now(),provider_reference=EXCLUDED.provider_reference,merchant_net_minor=EXCLUDED.merchant_net_minor,updated_at=now()`);

    await tx.execute(sql`UPDATE auction_listings SET status='paid',settlement_status='verified',settlement_reference=${transactionId},updated_at=now() WHERE id=${auctionId} AND status='payment_pending'`);
    await tx.execute(sql`UPDATE auction_bids SET settlement_status='paid' WHERE id=${bidId} AND auction_id=${auctionId}`);
    await tx.execute(sql`INSERT INTO domain_events (id,merchant_id,event_type,aggregate_type,aggregate_id,actor_type,actor_id,source,idempotency_key,payload,context,status) SELECT gen_random_uuid(),a.merchant_id,'auction.payment_verified','auction',a.id::text,'system',NULL,'flutterwave',${`product-auction-payment:${transactionId}`},${JSON.stringify({auctionId,bidId,providerTransactionId:transactionId,amount,currency,evidenceHash:hashEvidence(transaction)})}::jsonb,'{}'::jsonb,'pending' FROM auction_listings a WHERE a.id=${auctionId} ON CONFLICT DO NOTHING`);

    return { auctionId, bidId, status: "paid" as const };
  });
}
