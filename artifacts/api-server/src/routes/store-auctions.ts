import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requirePermission } from "../lib/tenant-access";

const router = Router();
const PROFIT_THRESHOLD_MINOR = 50_000_000;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function merchantIdFor(req: Request, res: Response): Promise<number | null> {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  const result = await db.execute(sql`SELECT id FROM merchants WHERE clerk_user_id = ${userId} LIMIT 1`);
  const id = Number((result.rows[0] as { id?: number } | undefined)?.id);
  if (!Number.isInteger(id)) { res.status(404).json({ error: "Merchant workspace not found" }); return null; }
  try { await requirePermission(userId, id, "team.manage"); } catch { res.status(403).json({ error: "Permission required" }); return null; }
  return id;
}

function internalPaymentSecretMatches(req: Request): boolean {
  const configured = process.env.LUNAVO_AUCTION_PAYMENT_WEBHOOK_SECRET;
  const supplied = String(req.get("x-lunavo-payment-secret") ?? "");
  if (!configured || !supplied) return false;
  const a = Buffer.from(configured);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function verifiedMetrics(tx: any, auctionId: number, merchantId: number, currency: string) {
  const metrics = await tx.execute(sql`
    WITH order_stats AS (
      SELECT COUNT(*)::int AS orders_count,
             COALESCE(SUM(total),0)::numeric AS revenue,
             COUNT(DISTINCT customer_id)::int AS customers_count
      FROM orders
      WHERE merchant_id = ${merchantId} AND status IN ('paid','processing','fulfilled','completed')
    ),
    inventory AS (
      SELECT COALESCE(SUM(GREATEST(COALESCE(availability_quantity,0),0)),0)::bigint AS units
      FROM supplier_products WHERE merchant_id = ${merchantId} AND status <> 'archived'
    ),
    ads AS (
      SELECT COALESCE(SUM(attributed_revenue_minor),0)::bigint AS ad_revenue,
             COALESCE(SUM(budget_minor),0)::bigint AS ad_spend
      FROM product_advertising_campaigns WHERE merchant_id = ${merchantId}
    )
    SELECT os.orders_count, os.revenue, os.customers_count,
           CASE WHEN os.orders_count > 0 THEN os.revenue / os.orders_count ELSE 0 END AS aov,
           i.units, a.ad_revenue, a.ad_spend,
           COALESCE(mvf.verified_profit_minor,0)::bigint AS verified_profit_minor,
           EXTRACT(DAY FROM (now() - m.registered_at))::int AS store_age_days
    FROM order_stats os CROSS JOIN inventory i CROSS JOIN ads a
    JOIN merchants m ON m.id = ${merchantId}
    LEFT JOIN merchant_verified_financials mvf ON mvf.merchant_id = ${merchantId} AND mvf.currency = 'USD'
  `);
  const row = metrics.rows[0] as Record<string, string | number | null> | undefined;
  const verifiedProfit = Number(row?.verified_profit_minor ?? 0);
  if (!Number.isSafeInteger(verifiedProfit) || verifiedProfit < 0) throw new Error("Invalid verified financial record");
  const revenue = Number(row?.revenue ?? 0);
  const orders = Number(row?.orders_count ?? 0);
  const snapshot = {
    revenueMinor: Math.round(revenue * 100), verifiedProfitMinor: verifiedProfit, ordersCount: orders,
    customersCount: Number(row?.customers_count ?? 0), aovMinor: Math.round(Number(row?.aov ?? 0) * 100),
    growthPercent: 0, trafficCount: 0, conversionPercent: 0,
    expensesMinor: Math.max(0, Math.round(revenue * 100) - verifiedProfit),
    adSpendMinor: Number(row?.ad_spend ?? 0), adRevenueMinor: Number(row?.ad_revenue ?? 0),
    storeAgeDays: Math.max(0, Number(row?.store_age_days ?? 0)), inventoryUnits: Number(row?.units ?? 0),
    valuationIndicatorMinor: Math.max(0, verifiedProfit * 3), currency,
  };
  const evidenceHash = hash(JSON.stringify(snapshot));
  await tx.execute(sql`
    INSERT INTO store_auction_metric_snapshots
      (auction_id,revenue_minor,verified_profit_minor,orders_count,customers_count,aov_minor,growth_percent,traffic_count,conversion_percent,expenses_minor,ad_spend_minor,ad_revenue_minor,store_age_days,inventory_units,valuation_indicator_minor,currency,evidence_hash)
    VALUES (${auctionId},${snapshot.revenueMinor},${snapshot.verifiedProfitMinor},${snapshot.ordersCount},${snapshot.customersCount},${snapshot.aovMinor},${snapshot.growthPercent},${snapshot.trafficCount},${snapshot.conversionPercent},${snapshot.expensesMinor},${snapshot.adSpendMinor},${snapshot.adRevenueMinor},${snapshot.storeAgeDays},${snapshot.inventoryUnits},${snapshot.valuationIndicatorMinor},${currency},${evidenceHash})
  `);
  return snapshot;
}

router.post("/merchant/store-auctions", async (req, res, next) => {
  try {
    const merchantId = await merchantIdFor(req, res); if (!merchantId) return;
    const storefrontId = String(req.body?.storefrontId ?? "");
    const askingPrice = Number(req.body?.askingPrice);
    const currency = String(req.body?.currency ?? "USD").toUpperCase();
    const startsAt = new Date(String(req.body?.startsAt ?? ""));
    const endsAt = new Date(String(req.body?.endsAt ?? ""));
    if (!/^[A-Z]{3}$/.test(currency) || !Number.isFinite(askingPrice) || askingPrice <= 0 || !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt || !/^[0-9a-f-]{36}$/i.test(storefrontId)) {
      res.status(400).json({ error: "Invalid store auction parameters" }); return;
    }
    const result = await db.transaction(async tx => {
      const store = await tx.execute(sql`SELECT id, merchant_id, name, master_admin_created FROM merchant_storefronts WHERE id = ${storefrontId} FOR UPDATE`);
      const row = store.rows[0] as { id?: string; merchant_id?: number; name?: string; master_admin_created?: boolean } | undefined;
      if (!row || Number(row.merchant_id) !== merchantId) throw Object.assign(new Error("Store not found or not owned by merchant"), { status: 404 });
      const financial = await tx.execute(sql`SELECT verified_profit_minor FROM merchant_verified_financials WHERE merchant_id = ${merchantId} AND currency = 'USD' FOR SHARE`);
      const profit = Number((financial.rows[0] as { verified_profit_minor?: string } | undefined)?.verified_profit_minor ?? 0);
      const exempt = Boolean(row.master_admin_created);
      if (!exempt && (!Number.isSafeInteger(profit) || profit < PROFIT_THRESHOLD_MINOR)) throw Object.assign(new Error("Store auction requires at least $500,000 verified profit"), { status: 403 });
      const inserted = await tx.execute(sql`
        INSERT INTO store_auction_listings (storefront_id,seller_merchant_id,asking_price,currency,starts_at,ends_at,status,seller_description)
        VALUES (${storefrontId},${merchantId},${askingPrice},${currency},${startsAt.toISOString()},${endsAt.toISOString()},'active',${String(req.body?.sellerDescription ?? "").slice(0,5000)}) RETURNING id
      `);
      const auctionId = Number((inserted.rows[0] as { id: string }).id);
      const snapshot = await verifiedMetrics(tx, auctionId, merchantId, currency);
      return { auctionId, storeName: row.name, exempt, snapshot };
    });
    res.status(201).json(result);
  } catch (e: any) { if (e?.status) { res.status(e.status).json({ error: e.message }); return; } next(e); }
});

router.post("/store-auctions/:id/bids", async (req, res, next) => {
  try {
    const bidderId = await merchantIdFor(req, res); if (!bidderId) return;
    const auctionId = Number(req.params.id); const amount = Number(req.body?.amount);
    if (!Number.isInteger(auctionId) || !Number.isFinite(amount) || amount <= 0) { res.status(400).json({ error: "Invalid bid" }); return; }
    const result = await db.transaction(async tx => {
      const auctionResult = await tx.execute(sql`SELECT id, seller_merchant_id, asking_price, currency, status, starts_at, ends_at FROM store_auction_listings WHERE id = ${auctionId} FOR UPDATE`);
      const auction = auctionResult.rows[0] as Record<string, any> | undefined;
      if (!auction) throw Object.assign(new Error("Auction not found"), { status: 404 });
      if (Number(auction.seller_merchant_id) === bidderId) throw Object.assign(new Error("Seller cannot bid on its own store auction"), { status: 403 });
      const now = Date.now();
      if (auction.status !== "active" || new Date(auction.starts_at).getTime() > now || new Date(auction.ends_at).getTime() <= now) throw Object.assign(new Error("Auction is not accepting bids"), { status: 409 });
      const current = await tx.execute(sql`SELECT COALESCE(MAX(amount),0) AS highest FROM store_auction_bids WHERE auction_id = ${auctionId} AND risk_status = 'accepted'`);
      const highest = Number((current.rows[0] as { highest?: string } | undefined)?.highest ?? 0);
      if (amount < Math.max(Number(auction.asking_price), highest + 0.01)) throw Object.assign(new Error("Bid must meet the asking price and exceed the current accepted bid"), { status: 409 });
      const merchant = await tx.execute(sql`SELECT email FROM merchants WHERE id = ${bidderId}`);
      const email = String((merchant.rows[0] as { email?: string } | undefined)?.email ?? "").trim().toLowerCase();
      const recent = await tx.execute(sql`SELECT COUNT(*)::int AS count FROM store_auction_bids WHERE auction_id = ${auctionId} AND normalized_bidder_email = ${email} AND risk_status <> 'rejected' AND created_at >= now() - interval '5 minutes'`);
      if (Number((recent.rows[0] as { count?: number } | undefined)?.count ?? 0) >= 12) throw Object.assign(new Error("Bid rate limit reached"), { status: 429 });
      const inserted = await tx.execute(sql`INSERT INTO store_auction_bids (auction_id,bidder_merchant_id,amount,currency,normalized_bidder_email,ip_hash,user_agent_hash,risk_status) VALUES (${auctionId},${bidderId},${amount},${auction.currency},${email},${hash(req.ip ?? "")},${hash(req.get("user-agent") ?? "")},'accepted') RETURNING id, amount`);
      return inserted.rows[0];
    });
    res.status(201).json({ bid: result });
  } catch (e: any) { if (e?.status) { res.status(e.status).json({ error: e.message }); return; } next(e); }
});

router.get("/public/store-auctions/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = await db.execute(sql`
      SELECT a.id,a.storefront_id,a.asking_price,a.currency,a.starts_at,a.ends_at,a.status,a.seller_description,s.name,
        COALESCE((SELECT MAX(amount) FROM store_auction_bids b WHERE b.auction_id=a.id AND b.risk_status='accepted'),a.asking_price) AS current_bid
      FROM store_auction_listings a JOIN merchant_storefronts s ON s.id=a.storefront_id WHERE a.id=${id} AND a.status IN ('active','closed')
    `);
    const auction = result.rows[0] as Record<string, any> | undefined;
    if (!auction) { res.status(404).json({ error: "Auction not found" }); return; }
    const metrics = await db.execute(sql`SELECT revenue_minor,verified_profit_minor,orders_count,customers_count,aov_minor,growth_percent,traffic_count,conversion_percent,expenses_minor,ad_spend_minor,ad_revenue_minor,store_age_days,inventory_units,valuation_indicator_minor,currency,captured_at FROM store_auction_metric_snapshots WHERE auction_id=${id} ORDER BY captured_at DESC LIMIT 30`);
    const bids = await db.execute(sql`SELECT amount,currency,created_at FROM store_auction_bids WHERE auction_id=${id} AND risk_status='accepted' ORDER BY created_at DESC LIMIT 50`);
    res.json({ auction, verifiedMetrics: metrics.rows, auctionHistory: bids.rows, customerData: "Customer identity and private customer records are excluded from public auction disclosure." });
  } catch (e) { next(e); }
});

/**
 * Payment adapters/webhook handlers call this boundary only after they have
 * independently verified the provider transaction. The browser and seller
 * close endpoint cannot mark a payment verified.
 */
router.post("/internal/store-auctions/:id/payment-verification", async (req, res, next) => {
  try {
    if (!internalPaymentSecretMatches(req)) { res.status(401).json({ error: "Unauthorized payment verification source" }); return; }
    const auctionId = Number(req.params.id);
    const bidId = Number(req.body?.bidId);
    const provider = String(req.body?.provider ?? "").trim().toLowerCase();
    const providerReference = String(req.body?.providerReference ?? "").trim();
    const amount = Number(req.body?.amount);
    const currency = String(req.body?.currency ?? "").trim().toUpperCase();
    if (!Number.isInteger(auctionId) || !Number.isInteger(bidId) || !provider || providerReference.length < 3 || !Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) {
      res.status(400).json({ error: "Invalid payment verification payload" }); return;
    }
    const result = await db.transaction(async tx => {
      const auctionResult = await tx.execute(sql`SELECT id,seller_merchant_id,currency,status FROM store_auction_listings WHERE id=${auctionId} FOR UPDATE`);
      const auction = auctionResult.rows[0] as Record<string, any> | undefined;
      if (!auction) throw Object.assign(new Error("Auction not found"), { status: 404 });
      const bidResult = await tx.execute(sql`SELECT id,auction_id,bidder_merchant_id,amount,currency,risk_status FROM store_auction_bids WHERE id=${bidId} AND auction_id=${auctionId} FOR UPDATE`);
      const bid = bidResult.rows[0] as Record<string, any> | undefined;
      if (!bid || bid.risk_status !== "accepted") throw Object.assign(new Error("Accepted winning bid not found"), { status: 409 });
      if (String(bid.currency).toUpperCase() !== currency || Math.abs(Number(bid.amount) - amount) > 0.005) throw Object.assign(new Error("Verified payment does not match winning bid"), { status: 409 });
      const existing = await tx.execute(sql`SELECT id,status FROM store_auction_payment_verifications WHERE provider=${provider} AND provider_reference=${providerReference} FOR UPDATE`);
      if (existing.rows.length) {
        const row = existing.rows[0] as Record<string, any>;
        if (row.status === "verified") return { id: Number(row.id), idempotent: true };
        throw Object.assign(new Error("Payment reference already exists with a non-verified status"), { status: 409 });
      }
      const inserted = await tx.execute(sql`INSERT INTO store_auction_payment_verifications (auction_id,bid_id,provider,provider_reference,amount,currency,status,verified_at,evidence_hash) VALUES (${auctionId},${bidId},${provider},${providerReference},${amount},${currency},'verified',now(),${hash(JSON.stringify({ auctionId, bidId, provider, providerReference, amount, currency }))}) RETURNING id`);
      await tx.execute(sql`UPDATE store_auction_listings SET payment_status='verified',payment_reference=${providerReference},winning_bid_id=${bidId} WHERE id=${auctionId}`);
      return { id: Number((inserted.rows[0] as { id: string }).id), idempotent: false };
    });
    res.status(201).json({ verified: true, ...result });
  } catch (e: any) { if (e?.status) { res.status(e.status).json({ error: e.message }); return; } next(e); }
});

router.post("/merchant/store-auctions/:id/close", async (req, res, next) => {
  try {
    const sellerId = await merchantIdFor(req, res); if (!sellerId) return;
    const auctionId = Number(req.params.id);
    if (!Number.isInteger(auctionId)) { res.status(400).json({ error: "Invalid auction id" }); return; }
    const result = await db.transaction(async tx => {
      const aResult = await tx.execute(sql`SELECT * FROM store_auction_listings WHERE id=${auctionId} FOR UPDATE`);
      const auction = aResult.rows[0] as Record<string, any> | undefined;
      if (!auction) throw Object.assign(new Error("Auction not found"), { status: 404 });
      if (Number(auction.seller_merchant_id) !== sellerId) throw Object.assign(new Error("Not auction owner"), { status: 403 });
      if (!["active","closed"].includes(String(auction.status))) throw Object.assign(new Error("Auction cannot be closed"), { status: 409 });
      const winnerResult = await tx.execute(sql`SELECT b.* FROM store_auction_bids b WHERE b.auction_id=${auctionId} AND b.risk_status='accepted' ORDER BY b.amount DESC,b.created_at ASC LIMIT 1`);
      const winner = winnerResult.rows[0] as Record<string, any> | undefined;
      if (!winner) throw Object.assign(new Error("No accepted winning bid"), { status: 409 });
      const payment = await tx.execute(sql`SELECT id,provider,provider_reference,amount,currency FROM store_auction_payment_verifications WHERE auction_id=${auctionId} AND bid_id=${winner.id} AND status='verified' ORDER BY verified_at DESC LIMIT 1`);
      const verifiedPayment = payment.rows[0] as Record<string, any> | undefined;
      if (!verifiedPayment) throw Object.assign(new Error("Ownership transfer is blocked until the payment adapter records a verified settlement"), { status: 409 });
      if (Math.abs(Number(verifiedPayment.amount) - Number(winner.amount)) > 0.005 || String(verifiedPayment.currency).toUpperCase() !== String(winner.currency).toUpperCase()) throw Object.assign(new Error("Verified settlement does not match the winning bid"), { status: 409 });
      const storeResult = await tx.execute(sql`SELECT id,merchant_id FROM merchant_storefronts WHERE id=${auction.storefront_id} FOR UPDATE`);
      const store = storeResult.rows[0] as { id?: string; merchant_id?: number } | undefined;
      if (!store || Number(store.merchant_id) !== sellerId) throw Object.assign(new Error("Store ownership changed; auction transfer aborted"), { status: 409 });
      await tx.execute(sql`UPDATE merchant_storefronts SET merchant_id=${winner.bidder_merchant_id}, updated_at=now() WHERE id=${auction.storefront_id}`);
      await tx.execute(sql`UPDATE merchant_storefront_domains SET merchant_id=${winner.bidder_merchant_id} WHERE storefront_id=${auction.storefront_id}`);
      await tx.execute(sql`INSERT INTO store_ownership_transfers (storefront_id,from_merchant_id,to_merchant_id,auction_id,reason,payment_reference) VALUES (${auction.storefront_id},${sellerId},${winner.bidder_merchant_id},${auctionId},'store auction acquisition',${verifiedPayment.provider_reference})`);
      await tx.execute(sql`UPDATE store_auction_listings SET status='transferred',winning_bid_id=${winner.id},payment_reference=${verifiedPayment.provider_reference},closed_at=now(),transferred_at=now() WHERE id=${auctionId}`);
      return { auctionId, storefrontId: auction.storefront_id, newOwnerMerchantId: Number(winner.bidder_merchant_id), paymentProvider: verifiedPayment.provider };
    });
    res.json({ transferred: true, ...result, privateCustomerRecordsTransferred: false });
  } catch (e: any) { if (e?.status) { res.status(e.status).json({ error: e.message }); return; } next(e); }
});

export default router;
