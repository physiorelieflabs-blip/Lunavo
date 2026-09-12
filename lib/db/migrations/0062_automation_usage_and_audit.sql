CREATE TABLE IF NOT EXISTS "merchant_automation_daily_usage" (
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "usage_date" date NOT NULL,
  "actions" integer NOT NULL DEFAULT 0 CHECK ("actions" >= 0),
  "ads_published" integer NOT NULL DEFAULT 0 CHECK ("ads_published" >= 0),
  PRIMARY KEY ("merchant_id", "usage_date")
);

CREATE TABLE IF NOT EXISTS "merchant_automation_audit" (
  "id" bigserial PRIMARY KEY,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "action_type" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('planned','executed','blocked','failed','approved','reversed')),
  "entity_type" text,
  "entity_id" text,
  "idempotency_key" text NOT NULL UNIQUE,
  "source" text NOT NULL DEFAULT 'lunavo_ai',
  "reason" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "merchant_automation_audit_merchant_time_idx" ON "merchant_automation_audit" ("merchant_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "product_opportunity_scores" (
  "id" bigserial PRIMARY KEY,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "external_key" text NOT NULL,
  "product_name" text NOT NULL,
  "currency" text NOT NULL,
  "supplier_cost_minor" bigint NOT NULL CHECK ("supplier_cost_minor" >= 0),
  "recommended_price_minor" bigint NOT NULL CHECK ("recommended_price_minor" > 0),
  "maximum_commercial_price_minor" bigint NOT NULL CHECK ("maximum_commercial_price_minor" >= "recommended_price_minor"),
  "demand_score" numeric(7,4) NOT NULL CHECK ("demand_score" BETWEEN 0 AND 100),
  "competition_score" numeric(7,4) NOT NULL CHECK ("competition_score" BETWEEN 0 AND 100),
  "profit_score" numeric(7,4) NOT NULL CHECK ("profit_score" BETWEEN 0 AND 100),
  "market_fit_score" numeric(7,4) NOT NULL CHECK ("market_fit_score" BETWEEN 0 AND 100),
  "supplier_score" numeric(7,4) NOT NULL CHECK ("supplier_score" BETWEEN 0 AND 100),
  "risk_score" numeric(7,4) NOT NULL CHECK ("risk_score" BETWEEN 0 AND 100),
  "opportunity_label" text NOT NULL CHECK ("opportunity_label" IN ('excellent','strong','watch','avoid')),
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "scored_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("merchant_id", "external_key")
);
CREATE INDEX IF NOT EXISTS "product_opportunity_scores_rank_idx" ON "product_opportunity_scores" ("merchant_id", "opportunity_label", "scored_at" DESC);

CREATE TABLE IF NOT EXISTS "ai_ad_schedules" (
  "merchant_id" integer PRIMARY KEY REFERENCES "merchants"("id") ON DELETE CASCADE,
  "daily_ad_limit" integer NOT NULL DEFAULT 3 CHECK ("daily_ad_limit" BETWEEN 0 AND 100),
  "enabled" boolean NOT NULL DEFAULT true,
  "channels" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "last_planned_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
