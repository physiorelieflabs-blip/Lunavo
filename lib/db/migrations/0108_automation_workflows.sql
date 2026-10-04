-- Lunavo merchant-defined workflow automation engine.
-- Workflows are tenant-scoped, versioned, replay-safe and never receive direct authority
-- to mutate financial truth. Actions execute through existing guarded server boundaries.
CREATE TABLE IF NOT EXISTS merchant_automation_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  workflow_key text NOT NULL,
  name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'dry_run' CHECK (mode IN ('dry_run','approval','automatic')),
  trigger_event text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  cooldown_seconds integer NOT NULL DEFAULT 0 CHECK (cooldown_seconds >= 0 AND cooldown_seconds <= 2592000),
  daily_run_limit integer NOT NULL DEFAULT 100 CHECK (daily_run_limit >= 0 AND daily_run_limit <= 10000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  last_run_at timestamptz,
  next_scheduled_at timestamptz,
  schedule_interval_seconds integer NOT NULL DEFAULT 0 CHECK (schedule_interval_seconds >= 0 AND schedule_interval_seconds <= 2592000),
  created_by text NOT NULL,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, workflow_key)
);
CREATE INDEX IF NOT EXISTS merchant_automation_workflows_trigger_idx
  ON merchant_automation_workflows(merchant_id, enabled, trigger_event);

CREATE TABLE IF NOT EXISTS merchant_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES merchant_automation_workflows(id) ON DELETE CASCADE,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event_id uuid,
  status text NOT NULL CHECK (status IN ('queued','running','completed','failed','skipped','approval_required','dry_run')),
  idempotency_key text NOT NULL UNIQUE,
  trigger_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS merchant_automation_runs_workflow_idx
  ON merchant_automation_runs(merchant_id,workflow_id,created_at DESC);
CREATE INDEX IF NOT EXISTS merchant_automation_runs_event_idx
  ON merchant_automation_runs(merchant_id,event_id,created_at DESC);
CREATE INDEX IF NOT EXISTS merchant_automation_runs_status_idx
  ON merchant_automation_runs(status,scheduled_at);

CREATE TABLE IF NOT EXISTS merchant_automation_action_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES merchant_automation_runs(id) ON DELETE CASCADE,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  reviewer_id text,
  reviewed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id)
);
CREATE INDEX IF NOT EXISTS merchant_automation_action_approvals_queue_idx
  ON merchant_automation_action_approvals(merchant_id,status,created_at ASC);
