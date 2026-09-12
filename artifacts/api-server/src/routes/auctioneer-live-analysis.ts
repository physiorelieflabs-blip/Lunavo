import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requirePermission } from "../lib/tenant-access";
import { buildAuctioneerStrategy, type AuctioneerStrategy } from "../lib/auctioneer-ai";

const router = Router();
const strategies = new Set<AuctioneerStrategy>(["maximize_value", "balanced", "fast_sale"]);

async function seller(req: Request, res: Response) {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  const merchant = await db.execute(sql`SELECT id FROM merchants WHERE clerk_user_id=${userId} LIMIT 1`);
  const merchantId = Number((merchant.rows[0] as { id?: number } | undefined)?.id);
  if (!Number.isInteger(merchantId)) { res.status(404).json({ error: "Merchant workspace not found" }); return null; }
  try { await requirePermission(userId, merchantId, "team.manage"); } catch { res.status(403).json({ error: "Permission required" }); return null; }
  return merchantId;
}

router.post("/merchant/store-auctions/:id/auctioneer-ai/live-recommendation", async (req, res, next) => {
  try {
    const merchantId = await seller(req, res); if (!merchantId) return;
    const auctionId = Number(req.params.id);
    if (!Number.isInteger(auctionId)) { res.status(400).json({ error: "Invalid auction id" }); return; }

    const result = await db.transaction(async tx => {
      const data = await tx.execute(sql`
        SELECT a.id,a.asking_price,a.currency,a.ends_at,
          COALESCE((SELECT MAX(b.amount) FROM store_auction_bids b WHERE b.auction_id=a.id AND b.risk_status='accepted'),0) AS current_bid,
          (SELECT COUNT(*)::int FROM store_auction_bids b WHERE b.auction_id=a.id AND b.risk_status='accepted') AS bid_count,
          s.strategy_mode,s.target_price,s.minimum_acceptable_price,s.enabled
        FROM store_auction_listings a
        JOIN auctioneer_ai_settings s ON s.auction_id=a.id
        WHERE a.id=${auctionId} AND a.seller_merchant_id=${merchantId}
        FOR UPDATE
      `);
      const row = data.rows[0] as Record<string, any> | undefined;
      if (!row) throw Object.assign(new Error("Auctioneer AI is not configured for this auction"), { status: 404 });
      if (!row.enabled) throw Object.assign(new Error("Auctioneer AI is disabled by the seller"), { status: 409 });

      const bids = await tx.execute(sql`
        SELECT amount,created_at,bidder_merchant_id
        FROM store_auction_bids
        WHERE auction_id=${auctionId} AND risk_status='accepted'
        ORDER BY created_at ASC
        LIMIT 200
      `);
      const bidHistory = bids.rows.map((bid: any) => ({
        amount: Number(bid.amount),
        createdAt: bid.created_at,
        bidderKey: String(bid.bidder_merchant_id),
      }));
      const hoursRemaining = Math.max(0, Number(row.ends_at ? (new Date(row.ends_at).getTime() - Date.now()) / 3600000 : 0));
      const first = bidHistory[0]?.createdAt ? new Date(bidHistory[0].createdAt).getTime() : Date.now();
      const elapsedHours = Math.max(1 / 60, (Date.now() - first) / 3600000);
      const velocity = bidHistory.length / elapsedHours;
      const strategy = String(row.strategy_mode) as AuctioneerStrategy;
      const recommendation = buildAuctioneerStrategy({
        askingPrice: Number(row.asking_price),
        currency: String(row.currency),
        currentBid: Number(row.current_bid),
        bidCount: Number(row.bid_count),
        hoursRemaining,
        historicalBidVelocity: velocity,
        targetPrice: row.target_price == null ? null : Number(row.target_price),
        minimumAcceptablePrice: row.minimum_acceptable_price == null ? null : Number(row.minimum_acceptable_price),
        bidHistory,
      }, strategies.has(strategy) ? strategy : "maximize_value");

      const rec = await tx.execute(sql`
        INSERT INTO auctioneer_ai_recommendations
          (auction_id,seller_merchant_id,recommendation_type,recommendation,recommended_value,currency,evidence)
        VALUES
          (${auctionId},${merchantId},'timing',${JSON.stringify(recommendation)},${recommendation.recommendedNextBid},${row.currency},${JSON.stringify({ ...recommendation, observedBids: bidHistory.length })})
        RETURNING id,created_at
      `);
      return { recommendation, observedBids: bidHistory.length, id: Number((rec.rows[0] as any).id), createdAt: (rec.rows[0] as any).created_at };
    });
    res.status(201).json(result);
  } catch (e: any) {
    if (e?.status) { res.status(e.status).json({ error: e.message }); return; }
    next(e);
  }
});

export default router;
