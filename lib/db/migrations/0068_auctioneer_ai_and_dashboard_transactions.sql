CREATE TABLE IF NOT EXISTS "auctioneer_ai_settings" (
  "auction_id" integer PRIMARY KEY REFERENCES "store_auction_listings"("id") ON DELETE CASCADE,
  "seller_merchant_id" integer NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT false,
  "strategy_mode" text NOT NULL DEFAULT 'maximize_value' CHECK ("strategy_mode" IN ('maximize_value','balanced','fast_sale')),
  "minimum_acceptable_price" numeric(20,2),
  "target_price" numeric(20,2),
  "max_daily_marketing_actions" integer NOT NULL DEFAULT 10 CHECK ("max_daily_marketing_actions" BETWEEN 0 AND 100),
  "allow_ai_copy_optimization" boolean NOT NULL DEFAULT true,
  "allow_ai_marketing_recommendations" boolean NOT NULL DEFAULT true,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "auctioneer_ai_price_bounds" CHECK (
    ("minimum_acceptable_price" IS NULL OR "minimum_acceptable_price" > 0)
    AND ("target_price" IS NULL OR "target_price" > 0)
    AND ("minimum_acceptable_price" IS NULL OR "target_price" IS NULL OR "target_price" >= "minimum_acceptable_price")
  )
);
CREATE INDEX IF NOT EXISTS "auctioneer_ai_settings_seller_idx" ON "auctioneer_ai_settings" ("seller_merchant_id");

CREATE TABLE IF NOT EXISTS "auctioneer_ai_recommendations" (
  "id" bigserial PRIMARY KEY,
  "auction_id" integer NOT NULL REFERENCES "store_auction_listings"("id") ON DELETE CASCADE,
  "seller_merchant_id" integer NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "recommendation_type" text NOT NULL CHECK ("recommendation_type" IN ('starting_price','reserve_price','target_price','bid_increment','duration','copy','marketing','timing')),
  "recommendation" text NOT NULL,
  "recommended_value" numeric(20,2),
  "currency" text,
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'recommended' CHECK ("status" IN ('recommended','accepted','dismissed','expired')),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "auctioneer_ai_recommendations_auction_idx" ON "auctioneer_ai_recommendations" ("auction_id","created_at" DESC);

CREATE TABLE IF NOT EXISTS "lunavo_dashboard_transactions" (
  "id" bigserial PRIMARY KEY,
  "merchant_id" integer REFERENCES "merchants"("id") ON DELETE SET NULL,
  "counterparty_merchant_id" integer REFERENCES "merchants"("id") ON DELETE SET NULL,
  "transaction_type" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('initiated','pending','confirmed','failed','reversed','reconciliation_required')),
  "amount_minor" bigint NOT NULL CHECK ("amount_minor" > 0),
  "currency" text NOT NULL CHECK ("currency" = upper("currency") AND char_length("currency") = 3),
  "lunavo_fee_minor" bigint NOT NULL DEFAULT 0 CHECK ("lunavo_fee_minor" >= 0),
  "provider_fee_minor" bigint NOT NULL DEFAULT 0 CHECK ("provider_fee_minor" >= 0),
  "merchant_net_minor" bigint,
  "provider" text,
  "provider_reference" text,
  "internal_reference" text NOT NULL UNIQUE,
  "idempotency_key" text NOT NULL UNIQUE,
  "source" text NOT NULL DEFAULT 'ts_pay',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "lunavo_dashboard_transactions_merchant_idx" ON "lunavo_dashboard_transactions" ("merchant_id","created_at" DESC);
CREATE INDEX IF NOT EXISTS "lunavo_dashboard_transactions_status_idx" ON "lunavo_dashboard_transactions" ("status","created_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "lunavo_dashboard_transactions_provider_ref_idx" ON "lunavo_dashboard_transactions" ("provider","provider_reference") WHERE "provider" IS NOT NULL AND "provider_reference" IS NOT NULL;
