import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router = Router();

router.get("/public/store-auctions", async (_req, res, next) => {
  try {
    const result = await db.execute(sql`
      SELECT a.id,a.storefront_id,s.name,a.asking_price,a.currency,a.starts_at,a.ends_at,a.status,a.seller_description,
        COALESCE((SELECT MAX(amount) FROM store_auction_bids b WHERE b.auction_id=a.id AND b.risk_status='accepted'),a.asking_price) AS current_bid,
        (SELECT COUNT(*)::int FROM store_auction_bids b WHERE b.auction_id=a.id AND b.risk_status='accepted') AS bid_count
      FROM store_auction_listings a
      JOIN merchant_storefronts s ON s.id=a.storefront_id
      WHERE a.status='active' AND a.starts_at <= now() AND a.ends_at > now()
      ORDER BY a.ends_at ASC LIMIT 100
    `);
    res.set("Cache-Control", "public, max-age=10, stale-while-revalidate=30");
    res.json({ auctions: result.rows });
  } catch (e) { next(e); }
});

export default router;
