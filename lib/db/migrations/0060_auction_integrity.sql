-- Auction integrity hardening.
-- Bids remain customer interest until the merchant completes the normal
-- payment/order flow; this migration only adds durable controls/audit data.
ALTER TABLE "auction_bids"
  ADD COLUMN IF NOT EXISTS "normalized_bidder_email" text,
  ADD COLUMN IF NOT EXISTS "risk_status" text NOT NULL DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS "risk_reason" text,
  ADD COLUMN IF NOT EXISTS "ip_hash" text,
  ADD COLUMN IF NOT EXISTS "user_agent_hash" text;

UPDATE "auction_bids"
SET "normalized_bidder_email" = lower(btrim("bidder_email"))
WHERE "normalized_bidder_email" IS NULL;

ALTER TABLE "auction_bids"
  ALTER COLUMN "normalized_bidder_email" SET NOT NULL;

ALTER TABLE "auction_bids"
  ADD CONSTRAINT "auction_bids_risk_status_check"
  CHECK ("risk_status" IN ('accepted', 'flagged', 'rejected'));

CREATE INDEX IF NOT EXISTS "auction_bids_auction_created_idx"
  ON "auction_bids" ("auction_id", "created_at");
CREATE INDEX IF NOT EXISTS "auction_bids_email_time_idx"
  ON "auction_bids" ("normalized_bidder_email", "created_at");
CREATE INDEX IF NOT EXISTS "auction_bids_risk_idx"
  ON "auction_bids" ("auction_id", "risk_status", "created_at");

-- Preserve only the active auction state in the listing. A winning bid is
-- determined at close from the highest accepted bid; no payment is implied.
CREATE INDEX IF NOT EXISTS "auction_listings_active_end_idx"
  ON "auction_listings" ("status", "ends_at", "id");
