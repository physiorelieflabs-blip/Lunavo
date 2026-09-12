CREATE TABLE IF NOT EXISTS "ai_daily_ad_plans" (
  "id" bigserial PRIMARY KEY,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "plan_date" date NOT NULL,
  "slot_index" integer NOT NULL CHECK ("slot_index" >= 1),
  "scheduled_at" timestamptz NOT NULL,
  "product_id" integer,
  "channel" text NOT NULL,
  "creative_id" uuid,
  "status" text NOT NULL DEFAULT 'planned' CHECK ("status" IN ('planned','queued','published','skipped','failed','paused')),
  "reason" text,
  "metrics" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "published_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "ai_daily_ad_plans_slot_unique" ON "ai_daily_ad_plans" ("merchant_id","plan_date","slot_index");
CREATE INDEX IF NOT EXISTS "ai_daily_ad_plans_due_idx" ON "ai_daily_ad_plans" ("scheduled_at","status");
CREATE INDEX IF NOT EXISTS "ai_daily_ad_plans_merchant_date_idx" ON "ai_daily_ad_plans" ("merchant_id","plan_date");

CREATE TABLE IF NOT EXISTS "ai_ad_performance_daily" (
  "id" bigserial PRIMARY KEY,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "plan_id" bigint REFERENCES "ai_daily_ad_plans"("id") ON DELETE SET NULL,
  "report_date" date NOT NULL,
  "channel" text NOT NULL,
  "impressions" bigint NOT NULL DEFAULT 0,
  "clicks" bigint NOT NULL DEFAULT 0,
  "conversions" bigint NOT NULL DEFAULT 0,
  "sales_minor" bigint NOT NULL DEFAULT 0,
  "spend_minor" bigint NOT NULL DEFAULT 0,
  "engagements" bigint NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("plan_id","report_date","channel")
);

CREATE TABLE IF NOT EXISTS "ai_ad_daily_reports" (
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "report_date" date NOT NULL,
  "planned" integer NOT NULL DEFAULT 0,
  "published" integer NOT NULL DEFAULT 0,
  "failed" integer NOT NULL DEFAULT 0,
  "skipped" integer NOT NULL DEFAULT 0,
  "impressions" bigint NOT NULL DEFAULT 0,
  "clicks" bigint NOT NULL DEFAULT 0,
  "conversions" bigint NOT NULL DEFAULT 0,
  "sales_minor" bigint NOT NULL DEFAULT 0,
  "spend_minor" bigint NOT NULL DEFAULT 0,
  "engagements" bigint NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("merchant_id","report_date")
);
