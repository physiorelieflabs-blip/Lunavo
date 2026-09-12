CREATE TABLE IF NOT EXISTS "merchant_automation_policies" (
  "merchant_id" integer PRIMARY KEY REFERENCES "merchants"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT true,
  "daily_action_limit" integer NOT NULL DEFAULT 500 CHECK ("daily_action_limit" BETWEEN 0 AND 10000),
  "daily_ad_limit" integer NOT NULL DEFAULT 3 CHECK ("daily_ad_limit" BETWEEN 0 AND 100),
  "min_margin_percent" numeric(7,2) NOT NULL DEFAULT 15 CHECK ("min_margin_percent" >= 0 AND "min_margin_percent" <= 100),
  "max_price_multiplier" numeric(10,4) NOT NULL DEFAULT 3 CHECK ("max_price_multiplier" > 0 AND "max_price_multiplier" <= 100),
  "require_approval_for_price_changes" boolean NOT NULL DEFAULT false,
  "require_approval_for_external_publish" boolean NOT NULL DEFAULT true,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "merchant_automation_daily_usage" (
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "usage_date" date NOT NULL,
  "actions" integer NOT NULL DEFAULT 0 CHECK ("actions" >= 0),
  "ads_published" integer NOT NULL DEFAULT 0 CHECK ("ads_published" >= 0),
  PRIMARY KEY ("merchant_id", "usage_date")
);

CREATE TABLE IF NOT EXISTS "merchant_security_events" (
  "id" bigserial PRIMARY KEY,
  "merchant_id" integer REFERENCES "merchants"("id") ON DELETE SET NULL,
  "event_type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'medium' CHECK ("severity" IN ('low','medium','high','critical')),
  "fingerprint" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "merchant_security_events_merchant_time_idx" ON "merchant_security_events" ("merchant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "merchant_security_events_type_time_idx" ON "merchant_security_events" ("event_type", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "store_auction_listings" (
  "id" bigserial PRIMARY KEY,
  "storefront_id" text NOT NULL,
  "seller_merchant_id" integer NOT NULL REFERENCES "merchants"("id"),
  "asking_price" numeric(18,2) NOT NULL CHECK ("asking_price" > 0),
  "currency" text NOT NULL,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','active','closed','cancelled','transferred')),
  "seller_description" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "closed_at" timestamptz,
  CHECK ("ends_at" > "starts_at")
);
CREATE INDEX IF NOT EXISTS "store_auction_listings_status_time_idx" ON "store_auction_listings" ("status", "ends_at");

CREATE TABLE IF NOT EXISTS "store_ownership_transfers" (
  "id" bigserial PRIMARY KEY,
  "storefront_id" text NOT NULL,
  "from_merchant_id" integer NOT NULL REFERENCES "merchants"("id"),
  "to_merchant_id" integer NOT NULL REFERENCES "merchants"("id"),
  "auction_id" bigint REFERENCES "store_auction_listings"("id"),
  "reason" text NOT NULL,
  "payment_reference" text,
  "transferred_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "store_ownership_transfers_store_time_idx" ON "store_ownership_transfers" ("storefront_id", "transferred_at" DESC);
