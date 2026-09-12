import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { initializeFlutterwavePayment } from "../lib/flutterwave-client";
import { requirePermission } from "../lib/tenant-access";

const router = Router();

async function bidderIdFor(req: Request, res: Response): Promise<number | null> {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  const result = await db.execute(sql`SELECT id FROM merchants WHERE clerk_user_id=${userId} LIMIT 1`);
  const merchantId = Number((result.rows[0] as { id?: number } | undefined)?.id);
  if (!Number.isInteger(merchantId)) { res.status(404).json({ error: "Merchant workspace not found" }); return null; }
  try { await requirePermission(userId, merchantId, "team.manage"); }
  catch { res.status(403).json({ error: "Permission required" }); return null; }
  return merchantId;
}

function redirectUrl(): string {
  const value = process.env.LUNAVO_AUCTION_PAYMENT_REDIRECT_URL?.trim();
  if (!value) throw Object.assign(new Error("Store auction payments are not configured"), { status: 503 });
  return value;
}

router.post("/merchant/store-auctions/:id/acquire", async (req, res, next) => {
  try {
    const bidderId = await bidderIdFor(req, res); if (!bidderId) return;
    const auctionId = Number(req.params.id);
    const bidId = Number(req.body?.bidId);
    if (!Number.isInteger(auctionId) || !Number.isInteger(bidId)) { res.status(400).json({ error: "Valid auction and bid are required" }); return; }

    const result = await db.transaction(async tx => {
      const auctionResult = await tx.execute(sql`
        SELECT id,storefront_id,seller_merchant_id,currency,status,payment_status,payment_reference
        FROM store_auction_listings WHERE id=${auctionId} FOR UPDATE
      `);
      const auction = auctionResult.rows[0] as Record<string, any> | undefined;
      if (!auction) throw Object.assign(new Error("Store auction not found"), { status: 404 });
      if (String(auction.status) === "transferred") throw Object.assign(new Error("Store has already been transferred"), { status: 409 });

      const bidResult = await tx.execute(sql`
        SELECT id,auction_id,bidder_merchant_id,amount,currency,risk_status
        FROM store_auction_bids WHERE id=${bidId} AND auction_id=${auctionId} FOR UPDATE
      `);
      const bid = bidResult.rows[0] as Record<string, any> | undefined;
      if (!bid || Number(bid.bidder_merchant_id) !== bidderId || bid.risk_status !== "accepted") throw Object.assign(new Error("Accepted bid does not belong to this buyer"), { status: 403 });
      const winner = await tx.execute(sql`SELECT id FROM store_auction_bids WHERE auction_id=${auctionId} AND risk_status='accepted' ORDER BY amount DESC,created_at ASC LIMIT 1`);
      const winningBid = winner.rows[0] as { id?: number } | undefined;
      if (!winningBid || Number(winningBid.id) !== bidId) throw Object.assign(new Error("Only the current highest accepted bid can acquire the store"), { status: 409 });
      if (!["closed","active"].includes(String(auction.status))) throw Object.assign(new Error("Store auction is not available for acquisition"), { status: 409 });

      const merchant = await tx.execute(sql`SELECT email FROM merchants WHERE id=${bidderId} LIMIT 1`);
      const email = String((merchant.rows[0] as { email?: string } | undefined)?.email ?? "").trim().toLowerCase();
      if (!email) throw Object.assign(new Error("Buyer email is required for payment"), { status: 400 });
      const txRef = String(auction.payment_reference ?? "").trim() || `LUNAVO-STORE-${auctionId}-${bidId}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
      const amount = Number(bid.amount);
      const currency = String(bid.currency).toUpperCase();
      const storeName = String((await tx.execute(sql`SELECT name FROM merchant_storefronts WHERE id=${auction.storefront_id} LIMIT 1`)).rows[0]?.name ?? "Lunavo Store");

      await tx.execute(sql`UPDATE store_auction_listings SET payment_status='pending',payment_reference=${txRef},winning_bid_id=${bidId} WHERE id=${auctionId} AND payment_status <> 'verified'`);
      await tx.execute(sql`
        INSERT INTO lunavo_dashboard_transactions
          (merchant_id,counterparty_merchant_id,transaction_type,status,amount_minor,currency,lunavo_fee_minor,merchant_net_minor,provider,internal_reference,idempotency_key,source,metadata)
        VALUES
          (${bidderId},${auction.seller_merchant_id},'store_auction_acquisition','pending',${Math.round(amount*100)},${currency},0,${-Math.round(amount*100)},'flutterwave',${`STORE-AUC-${auctionId}-${bidId}`},${`store-auction:${auctionId}:${bidId}`},'ts_pay',${JSON.stringify({auctionId,bidId,txRef,role:'buyer'})}::jsonb)
        ON CONFLICT (idempotency_key) DO NOTHING
      `);
      return { auctionId, bidId, amount, currency, email, txRef, storeName, sellerMerchantId: Number(auction.seller_merchant_id), buyerMerchantId: bidderId };
    });

    const checkout = await initializeFlutterwavePayment({
      txRef: result.txRef,
      amount: result.amount,
      currency: result.currency,
      redirectUrl: redirectUrl(),
      customer: { email: result.email, name: result.storeName },
      title: `Lunavo Store Acquisition — ${result.storeName}`,
      paymentOptions: "card,banktransfer,ussd,mobilemoney",
      meta: { store_auction_id: result.auctionId, store_auction_bid_id: result.bidId, payment_kind: "store_auction_acquisition" },
    });
    res.status(201).json({
      paymentMethod: "lunavo_store_acquisition_flutterwave",
      status: "payment_pending",
      amount: result.amount,
      currency: result.currency,
      txRef: checkout.txRef,
      checkoutUrl: checkout.link,
      dashboardTransactionReference: `STORE-AUC-${result.auctionId}-${result.bidId}`,
      ownershipTransfer: "Automatic only after server-side provider verification",
    });
  } catch (e: any) { if (e?.status) { res.status(e.status).json({ error: e.message }); return; } next(e); }
});

export default router;
