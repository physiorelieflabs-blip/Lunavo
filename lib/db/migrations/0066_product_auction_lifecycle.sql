ALTER TABLE "auction_listings"
  ADD COLUMN IF NOT EXISTS "winning_bid_id" integer REFERENCES "auction_bids"("id"),
  ADD COLUMN IF NOT EXISTS "closed_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "settlement_status" text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS "settlement_reference" text;

ALTER TABLE "auction_listings"
  DROP CONSTRAINT IF EXISTS "auction_listings_settlement_status_check";
ALTER TABLE "auction_listings"
  ADD CONSTRAINT "auction_listings_settlement_status_check"
  CHECK ("settlement_status" IN ('unpaid','pending','verified','failed'));

CREATE INDEX IF NOT EXISTS "auction_listings_winner_idx"
  ON "auction_listings" ("winning_bid_id");
CREATE INDEX IF NOT EXISTS "auction_listings_settlement_idx"
  ON "auction_listings" ("settlement_status", "ends_at");

ALTER TABLE "auction_bids"
  ADD COLUMN IF NOT EXISTS "settlement_status" text NOT NULL DEFAULT 'not_winner';
ALTER TABLE "auction_bids"
  DROP CONSTRAINT IF EXISTS "auction_bids_settlement_status_check";
ALTER TABLE "auction_bids"
  ADD CONSTRAINT "auction_bids_settlement_status_check"
  CHECK ("settlement_status" IN ('not_winner','pending','paid','failed','expired'));
