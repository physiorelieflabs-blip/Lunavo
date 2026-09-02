CREATE TABLE IF NOT EXISTS "ai_models" (
  "id" serial PRIMARY KEY,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id"),
  "name" text NOT NULL,
  "version" text NOT NULL,
  "model_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'untrained',
  "training_examples" integer NOT NULL DEFAULT 0,
  "evaluation_score" numeric(5, 4),
  "weights" jsonb,
  "trained_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_models_merchant_name_version_unique"
  ON "ai_models" ("merchant_id", "name", "version");

CREATE TABLE IF NOT EXISTS "ai_settings" (
  "id" serial PRIMARY KEY,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id"),
  "autonomy_level" integer NOT NULL DEFAULT 1,
  "run_my_business" boolean NOT NULL DEFAULT false,
  "training_opt_in" boolean NOT NULL DEFAULT true,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_settings_merchant_id_unique"
  ON "ai_settings" ("merchant_id");

CREATE TABLE IF NOT EXISTS "ai_actions" (
  "id" serial PRIMARY KEY,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id"),
  "agent" text NOT NULL,
  "action_type" text NOT NULL,
  "title" text NOT NULL,
  "reason" text NOT NULL,
  "data_used" jsonb,
  "result" jsonb,
  "status" text NOT NULL DEFAULT 'awaiting_approval',
  "risk" text NOT NULL DEFAULT 'low',
  "reversible" boolean NOT NULL DEFAULT true,
  "approval_required" boolean NOT NULL DEFAULT true,
  "rollback_available" boolean NOT NULL DEFAULT true,
  "approved_at" timestamptz,
  "executed_at" timestamptz,
  "rolled_back_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ai_actions_merchant_created_idx"
  ON "ai_actions" ("merchant_id", "created_at");