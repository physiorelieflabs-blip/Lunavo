-- Persistent connected dropship command runs.
-- These are advisory operating artifacts, never financial or inventory truth.
CREATE TABLE IF NOT EXISTS dropship_command_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  question text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  brain_model text,
  contributors jsonb NOT NULL DEFAULT '[]'::jsonb,
  roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  consensus text NOT NULL DEFAULT 'single',
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('running','completed','failed')),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS dropship_command_runs_merchant_created_idx
  ON dropship_command_runs(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dropship_command_runs_status_idx
  ON dropship_command_runs(status, created_at DESC);
