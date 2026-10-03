CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text,
  "merchant_id" text,
  "action" text NOT NULL,
  "resource_type" text,
  "resource_id" text,
  "changes" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ip_address" text,
  "user_agent" text,
  "status" text NOT NULL DEFAULT 'success',
  "error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "audit_logs_merchant_created_idx" ON "audit_logs" ("merchant_id","created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_user_created_idx" ON "audit_logs" ("user_id","created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_action_created_idx" ON "audit_logs" ("action","created_at" DESC);
