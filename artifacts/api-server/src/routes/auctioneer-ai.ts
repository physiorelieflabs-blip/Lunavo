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

router.get("/merchant/store-auctions/:id/auctioneer-ai", async (req, res, next) => {
  try {
    const merchantId = await seller(req, res); if (!merchantId) return;
    const auctionId = Number(req.params.id);
    const result = await db.execute(sql`
      SELECT a.id,a.seller_merchant_id,a.asking_price,a.currency,
             COALESCE((SELECT MAX(amount) FROM store_auction_bids b WHERE b.auction_id=a.id AND b.risk_status='accepted'),0) AS current_bid,
             (SELECT COUNT(*)::int FROM store_auction_bids b WHERE b.auction_id=a.id AND b.risk_status='accepted') AS bid_count,
             EXTRACT(EPOCH FROM (a.ends_at-now()))/3600.0 AS hours_remaining,
             s.enabled,s.strategy_mode,s.minimum_acceptable_price,s.target_price,
             s.allow_ai_copy_optimization,s.allow_ai_marketing_recommendations,s.max_daily_marketing_actions
      FROM store_auction_listings a
      LEFT JOIN auctioneer_ai_settings s ON s.auction_id=a.id
      WHERE a.id=${auctionId} AND a.seller_merchant_id=${merchantId}
    `);
    const row = result.rows[0];
    if (!row) { res.status(404).json({ error: "Store auction not found" }); return; }
    const recommendations = await db.execute(sql`SELECT id,recommendation_type,recommendation,recommended_value,currency,evidence,status,created_at FROM auctioneer_ai_recommendations WHERE auction_id=${auctionId} ORDER BY created_at DESC LIMIT 30`);
    res.json({ settings: row, recommendations: recommendations.rows });
  } catch (e) { next(e); }
});

router.put("/merchant/store-auctions/:id/auctioneer-ai", async (req, res, next) => {
  try {
    const merchantId = await seller(req, res); if (!merchantId) return;
    const auctionId = Number(req.params.id);
    const enabled = Boolean(req.body?.enabled);
    const strategy = String(req.body?.strategyMode ?? "maximize_value") as AuctioneerStrategy;
    if (!Number.isInteger(auctionId) || !strategies.has(strategy)) { res.status(400).json({ error: "Invalid auctioneer AI settings" }); return; }
    const min = req.body?.minimumAcceptablePrice == null ? null : Number(req.body.minimumAcceptablePrice);
    const target = req.body?.targetPrice == null ? null : Number(req.body.targetPrice);
    const daily = req.body?.maxDailyMarketingActions == null ? 10 : Number(req.body.maxDailyMarketingActions);
    if ((min != null && (!Number.isFinite(min) || min <= 0)) || (target != null && (!Number.isFinite(target) || target <= 0)) || (min != null && target != null && target < min) || !Number.isInteger(daily) || daily < 0 || daily > 100) {
      res.status(400).json({ error: "Invalid AI price or marketing limits" }); return;
    }
    const result = await db.transaction(async tx => {
      const auction = await tx.execute(sql`SELECT id,asking_price,currency,current_bid FROM (SELECT a.*,COALESCE((SELECT MAX(amount) FROM store_auction_bids b WHERE b.auction_id=a.id AND b.risk_status='accepted'),0) AS current_bid FROM store_auction_listings a) x WHERE id=${auctionId} AND seller_merchant_id=${merchantId} FOR UPDATE`);
      const row = auction.rows[0] as Record<string, any> | undefined;
      if (!row) throw Object.assign(new Error("Store auction not found"), { status: 404 });
      await tx.execute(sql`
        INSERT INTO auctioneer_ai_settings (auction_id,seller_merchant_id,enabled,strategy_mode,minimum_acceptable_price,target_price,max_daily_marketing_actions,allow_ai_copy_optimization,allow_ai_marketing_recommendations,updated_at)
        VALUES (${auctionId},${merchantId},${enabled},${strategy},${min},${target},${daily},${req.body?.allowAiCopyOptimization !== false},${req.body?.allowAiMarketingRecommendations !== false},now())
        ON CONFLICT (auction_id) DO UPDATE SET enabled=EXCLUDED.enabled,strategy_mode=EXCLUDED.strategy_mode,minimum_acceptable_price=EXCLUDED.minimum_acceptable_price,target_price=EXCLUDED.target_price,max_daily_marketing_actions=EXCLUDED.max_daily_marketing_actions,allow_ai_copy_optimization=EXCLUDED.allow_ai_copy_optimization,allow_ai_marketing_recommendations=EXCLUDED.allow_ai_marketing_recommendations,updated_at=now()
      `);
      return row;
    });
    res.json({ enabled, strategyMode: strategy, auctionId, currentBid: Number(result.current_bid ?? 0), message: enabled ? "Auctioneer AI enabled. Recommendations will remain inside seller controls." : "Auctioneer AI disabled." });
  } catch (e: any) { if (e?.status) { res.status(e.status).json({ error: e.message }); return; } next(e); }
});

router.post("/merchant/store-auctions/:id/auctioneer-ai/recommend", async (req, res, next) => {
  try {
    const merchantId = await seller(req, res); if (!merchantId) return;
    const auctionId = Number(req.params.id);
    const result = await db.transaction(async tx => {
      const data = await tx.execute(sql`
        SELECT a.id,a.asking_price,a.currency,a.ends_at,
          COALESCE((SELECT MAX(amount) FROM store_auction_bids b WHERE b.auction_id=a.id AND b.risk_status='accepted'),0) AS current_bid,
          (SELECT COUNT(*)::int FROM store_auction_bids b WHERE b.auction_id=a.id AND b.risk_status='accepted') AS bid_count,
          COALESCE((SELECT COUNT(*)::numeric / NULLIF(EXTRACT(EPOCH FROM (MAX(b.created_at)-MIN(b.created_at)))/3600.0,0) FROM store_auction_bids b WHERE b.auction_id=a.id AND b.risk_status='accepted'),0) AS velocity,
          s.strategy_mode,s.target_price,s.minimum_acceptable_price,s.enabled
        FROM store_auction_listings a JOIN auctioneer_ai_settings s ON s.auction_id=a.id
        WHERE a.id=${auctionId} AND a.seller_merchant_id=${merchantId} FOR UPDATE
      `);
      const row = data.rows[0] as Record<string, any> | undefined;
      if (!row) throw Object.assign(new Error("Auctioneer AI is not configured for this auction"), { status: 404 });
      if (!row.enabled) throw Object.assign(new Error("Auctioneer AI is disabled by the seller"), { status: 409 });
      const strategy = String(row.strategy_mode) as AuctioneerStrategy;
      const recommendation = buildAuctioneerStrategy({
        askingPrice: Number(row.asking_price), currency: String(row.currency), currentBid: Number(row.current_bid), bidCount: Number(row.bid_count),
        hoursRemaining: Math.max(0, Number(row.ends_at ? (new Date(row.ends_at).getTime()-Date.now())/3600000 : 0)),
        historicalBidVelocity: Number(row.velocity), targetPrice: row.target_price == null ? null : Number(row.target_price), minimumAcceptablePrice: row.minimum_acceptable_price == null ? null : Number(row.minimum_acceptable_price),
      }, strategy);
      const rec = await tx.execute(sql`INSERT INTO auctioneer_ai_recommendations (auction_id,seller_merchant_id,recommendation_type,recommendation,recommended_value,currency,evidence) VALUES (${auctionId},${merchantId},'target_price',${JSON.stringify(recommendation)},${recommendation.targetBid},${row.currency},${JSON.stringify(recommendation)}) RETURNING id,created_at`);
      return { recommendation, id: Number((rec.rows[0] as { id: string }).id), createdAt: (rec.rows[0] as { created_at: string }).created_at };
    });
    res.status(201).json(result);
  } catch (e: any) { if (e?.status) { res.status(e.status).json({ error: e.message }); return; } next(e); }
});

export default router;
