import { Router } from "express";
import { getAuth } from "@clerk/express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requirePermission } from "../lib/tenant-access";

const router = Router();

async function merchantIdFor(userId: string): Promise<number | null> {
  const rows = await db.execute(sql`SELECT id FROM merchants WHERE clerk_user_id=${userId} LIMIT 1`);
  const id = Number((rows.rows[0] as { id?: number } | undefined)?.id);
  return Number.isInteger(id) ? id : null;
}

router.post("/merchant/auctions/:id/close", async (req, res, next): Promise<void> => {
  try {
    const userId = getAuth(req).userId;
    if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
    const merchantId = await merchantIdFor(userId);
    if (!merchantId) { res.status(404).json({ error: "Merchant workspace not found" }); return; }
    try { await requirePermission(userId, merchantId, "team.manage"); }
    catch { res.status(403).json({ error: "Permission required" }); return; }

    const auctionId = Number(req.params.id);
    if (!Number.isInteger(auctionId) || auctionId < 1) { res.status(400).json({ error: "Invalid auction" }); return; }

    const result = await db.transaction(async tx => {
      const rows = await tx.execute(sql`
        SELECT id, merchant_id, currency, starting_price, reserve_price, starts_at, ends_at, status, settlement_status, winning_bid_id
        FROM auction_listings WHERE id=${auctionId} FOR UPDATE
      `);
      const auction = rows.rows[0] as Record<string, any> | undefined;
      if (!auction) throw Object.assign(new Error("Auction not found"), { status: 404 });
      if (Number(auction.merchant_id) !== merchantId) throw Object.assign(new Error("Auction does not belong to this merchant"), { status: 403 });
      if (["closed","settled","cancelled"].includes(String(auction.status))) {
        const existing = auction.winning_bid_id ? await tx.execute(sql`SELECT id, bidder_name, amount, currency, created_at FROM auction_bids WHERE id=${auction.winning_bid_id} LIMIT 1`) : { rows: [] };
        return { alreadyClosed: true, auction, winner: existing.rows[0] ?? null };
      }
      if (String(auction.status) !== "active") throw Object.assign(new Error("Auction cannot be closed"), { status: 409 });
      if (new Date(String(auction.ends_at)).getTime() > Date.now() && req.body?.force !== true) {
        throw Object.assign(new Error("Auction has not reached its end time"), { status: 409 });
      }

      const bids = await tx.execute(sql`
        SELECT id, bidder_name, bidder_email, amount, currency, created_at
        FROM auction_bids
        WHERE auction_id=${auctionId} AND risk_status='accepted'
        ORDER BY amount DESC, created_at ASC, id ASC LIMIT 1
      `);
      const winner = bids.rows[0] as Record<string, any> | undefined;
      if (!winner) {
        await tx.execute(sql`UPDATE auction_listings SET status='closed', closed_at=now(), settlement_status='unpaid', updated_at=now() WHERE id=${auctionId}`);
        return { alreadyClosed: false, auctionId, winner: null, reserveMet: false, settlementStatus: "unpaid" };
      }

      const winningAmount = Number(winner.amount);
      const reserve = auction.reserve_price == null ? null : Number(auction.reserve_price);
      const reserveMet = reserve == null || winningAmount >= reserve;
      if (!reserveMet) {
        await tx.execute(sql`UPDATE auction_bids SET settlement_status='expired' WHERE auction_id=${auctionId} AND risk_status='accepted'`);
        await tx.execute(sql`UPDATE auction_listings SET status='closed', closed_at=now(), settlement_status='unpaid', winning_bid_id=NULL, updated_at=now() WHERE id=${auctionId}`);
        return { alreadyClosed: false, auctionId, winner: null, reserveMet: false, highestBid: winningAmount, settlementStatus: "unpaid" };
      }

      await tx.execute(sql`UPDATE auction_bids SET settlement_status='expired' WHERE auction_id=${auctionId} AND risk_status='accepted' AND id<>${winner.id}`);
      await tx.execute(sql`UPDATE auction_bids SET settlement_status='pending' WHERE id=${winner.id}`);
      await tx.execute(sql`UPDATE auction_listings SET status='closed', closed_at=now(), winning_bid_id=${winner.id}, settlement_status='pending', updated_at=now() WHERE id=${auctionId}`);
      return {
        alreadyClosed: false,
        auctionId,
        winner: { id: Number(winner.id), bidderName: String(winner.bidder_name), amount: winningAmount, currency: String(winner.currency) },
        reserveMet: true,
        settlementStatus: "pending",
      };
    });

    res.json(result);
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    res.status(status).json({ error: status < 500 ? error.message : "Unable to close auction" });
    if (status >= 500) next(error);
  }
});

router.get("/merchant/auctions/:id/settlement", async (req, res, next): Promise<void> => {
  try {
    const userId = getAuth(req).userId;
    if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
    const merchantId = await merchantIdFor(userId);
    if (!merchantId) { res.status(404).json({ error: "Merchant workspace not found" }); return; }
    const auctionId = Number(req.params.id);
    const rows = await db.execute(sql`
      SELECT a.id,a.status,a.settlement_status,a.settlement_reference,a.winning_bid_id,b.bidder_name,b.amount,b.currency,b.settlement_status AS bid_settlement_status
      FROM auction_listings a LEFT JOIN auction_bids b ON b.id=a.winning_bid_id
      WHERE a.id=${auctionId} AND a.merchant_id=${merchantId}
    `);
    const row = rows.rows[0];
    if (!row) { res.status(404).json({ error: "Auction not found" }); return; }
    res.json({ auction: row, paymentRequired: row.settlement_status !== "verified" });
  } catch (error) { next(error); }
});

export default router;
