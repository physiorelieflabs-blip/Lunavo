ALTER TABLE "merchant_storefronts"
  ADD COLUMN IF NOT EXISTS "master_admin_created" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "store_auction_bids" (
  "id" bigserial PRIMARY KEY,
  "auction_id" bigint NOT NULL REFERENCES "store_auction_listings"("id") ON DELETE CASCADE,
  "bidder_merchant_id" integer NOT NULL REFERENCES "merchants"("id") ON DELETE RESTRICT,
  "amount" numeric(18,2) NOT NULL CHECK ("amount" > 0),
  "currency" text NOT NULL,
  "normalized_bidder_email" text,
  "ip_hash" text,
  "user_agent_hash" text,
  "risk_status" text NOT NULL DEFAULT 'accepted' CHECK ("risk_status" IN ('accepted','flagged','rejected')),
  "risk_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "store_auction_bids_auction_amount_idx" ON "store_auction_bids" ("auction_id", "amount" DESC, "created_at" ASC);
CREATE INDEX IF NOT EXISTS "store_auction_bids_bidder_time_idx" ON "store_auction_bids" ("bidder_merchant_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "store_auction_metric_snapshots" (
  "id" bigserial PRIMARY KEY,
  "auction_id" bigint NOT NULL REFERENCES "store_auction_listings"("id") ON DELETE CASCADE,
  "revenue_minor" bigint NOT NULL DEFAULT 0,
  "verified_profit_minor" bigint NOT NULL DEFAULT 0,
  "orders_count" integer NOT NULL DEFAULT 0,
  "customers_count" integer NOT NULL DEFAULT 0,
  "aov_minor" bigint NOT NULL DEFAULT 0,
  "growth_percent" numeric(10,2) NOT NULL DEFAULT 0,
  "traffic_count" bigint NOT NULL DEFAULT 0,
  "conversion_percent" numeric(10,4) NOT NULL DEFAULT 0,
  "expenses_minor" bigint NOT NULL DEFAULT 0,
  "ad_spend_minor" bigint NOT NULL DEFAULT 0,
  "ad_revenue_minor" bigint NOT NULL DEFAULT 0,
  "store_age_days" integer NOT NULL DEFAULT 0,
  "inventory_units" bigint NOT NULL DEFAULT 0,
  "valuation_indicator_minor" bigint NOT NULL DEFAULT 0,
  "currency" text NOT NULL,
  "evidence_hash" text,
  "captured_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "store_auction_metrics_auction_time_idx" ON "store_auction_metric_snapshots" ("auction_id", "captured_at" DESC);

ALTER TABLE "store_auction_listings"
  ADD COLUMN IF NOT EXISTS "winning_bid_id" bigint REFERENCES "store_auction_bids"("id"),
  ADD COLUMN IF NOT EXISTS "payment_status" text NOT NULL DEFAULT 'unpaid' CHECK ("payment_status" IN ('unpaid','pending','verified','failed')),
  ADD COLUMN IF NOT EXISTS "payment_reference" text,
  ADD COLUMN IF NOT EXISTS "transferred_at" timestamptz;

CREATE INDEX IF NOT EXISTS "store_auction_listings_winner_idx" ON "store_auction_listings" ("winning_bid_id");
