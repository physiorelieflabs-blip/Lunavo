import { createHash } from "node:crypto";
import { Router } from "express";
import { sql } from "drizzle-orm";
import { PlaceAuctionBidParams, PlaceAuctionBidBody, PlaceAuctionBidResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";

const router = Router();
const BID_INCREMENT = 0.01;
const EMAIL_WINDOW_MS = 5 * 60_000;
const MAX_BIDS_PER_EMAIL = 12;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Authoritative bid gate. This route is mounted before the legacy commerce
 * router so concurrent bids cannot race through an unlocked read/insert.
 */
router.post("/auctions/:id/bids", async (req, res): Promise<void> => {
  const params = PlaceAuctionBidParams.safeParse(req.params);
  const parsed = PlaceAuctionBidBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Enter a valid name, email, and bid amount" });
    return;
  }

  const auctionId = Number(params.data.id);
  const bidderName = parsed.data.bidderName.trim();
  const bidderEmail = parsed.data.bidderEmail.trim().toLowerCase();
  const amount = Number(parsed.data.amount);
  const ip = String(req.ip || req.socket.remoteAddress || "unknown");
  const userAgent = String(req.get("user-agent") || "unknown");

  if (!Number.isInteger(auctionId) || auctionId <= 0 || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "Enter a valid bid" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Lock the auction row so two bidders cannot both pass the same current
      // bid check and create an invalid ordering.
      const auctionRows = await tx.execute(sql`
        SELECT id, merchant_id, currency, starting_price, reserve_price,
               starts_at, ends_at, status
        FROM auction_listings
        WHERE id = ${auctionId}
        FOR UPDATE
      `);
      const auction = auctionRows.rows[0] as {
        id: number; merchant_id: number; currency: string;
        starting_price: string; reserve_price: string | null;
        starts_at: string; ends_at: string; status: string;
      } | undefined;

      if (!auction) throw Object.assign(new Error("Auction not found"), { status: 404 });
      const now = Date.now();
      if (auction.status !== "active" || new Date(auction.starts_at).getTime() > now || new Date(auction.ends_at).getTime() <= now) {
        throw Object.assign(new Error("This auction is no longer accepting bids"), { status: 409 });
      }

      // A merchant cannot bid on its own listing, even when using the public
      // anonymous bidding form.
      const merchantRows = await tx.execute(sql`
        SELECT lower(email) AS email
        FROM merchants WHERE id = ${auction.merchant_id} LIMIT 1
      `);
      const merchantEmail = String((merchantRows.rows[0] as { email?: string } | undefined)?.email || "");
      if (merchantEmail && merchantEmail === bidderEmail) {
        throw Object.assign(new Error("A merchant cannot bid on its own auction"), { status: 403 });
      }

      const cutoff = new Date(now - EMAIL_WINDOW_MS);
      const velocityRows = await tx.execute(sql`
        SELECT count(*)::int AS count
        FROM auction_bids
        WHERE normalized_bidder_email = ${bidderEmail}
          AND created_at >= ${cutoff}
          AND risk_status <> 'rejected'
      `);
      if (Number((velocityRows.rows[0] as { count?: number } | undefined)?.count || 0) >= MAX_BIDS_PER_EMAIL) {
        throw Object.assign(new Error("Too many bids from this email. Please wait a few minutes."), { status: 429 });
      }

      const latestRows = await tx.execute(sql`
        SELECT amount FROM auction_bids
        WHERE auction_id = ${auctionId} AND risk_status = 'accepted'
        ORDER BY amount DESC, id DESC LIMIT 1
      `);
      const latest = latestRows.rows[0] as { amount?: string } | undefined;
      const current = latest ? Number(latest.amount) : Number(auction.starting_price);
      const minimum = Math.round((current + BID_INCREMENT) * 100) / 100;
      if (amount < minimum) {
        throw Object.assign(new Error(`Bid must be at least ${minimum.toFixed(2)} ${auction.currency}`), { status: 409 });
      }

      const [inserted] = (await tx.execute(sql`
        INSERT INTO auction_bids
          (auction_id, bidder_name, bidder_email, normalized_bidder_email, amount,
           risk_status, risk_reason, ip_hash, user_agent_hash)
        VALUES
          (${auctionId}, ${bidderName}, ${bidderEmail}, ${bidderEmail}, ${amount.toFixed(2)},
           'accepted', NULL, ${hash(ip)}, ${hash(userAgent)})
        RETURNING id, auction_id, bidder_name, amount, created_at
      `)).rows as Array<{ id: number; auction_id: number; bidder_name: string; amount: string; created_at: string }>;

      return inserted;
    });

    const response = PlaceAuctionBidResponse.parse({
      id: Number(result.id), auctionId: Number(result.auction_id),
      bidderName: result.bidder_name, amount: Number(result.amount),
      createdAt: new Date(result.created_at),
    });
    res.status(201).json(response);
  } catch (error) {
    const status = Number((error as { status?: number }).status) || 500;
    if (status < 500) {
      res.status(status).json({ error: (error as Error).message });
      return;
    }
    res.status(500).json({ error: "Unable to place bid right now" });
  }
});

export default router;
