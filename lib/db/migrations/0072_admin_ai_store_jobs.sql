CREATE TABLE IF NOT EXISTS admin_ai_store_jobs (
  id bigserial PRIMARY KEY,
  requested_by text NOT NULL,
  niche text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','researching','ready_for_review','building','published','failed','cancelled')),
  research jsonb NOT NULL DEFAULT '{}'::jsonb,
  build_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS admin_ai_store_jobs_status_idx ON admin_ai_store_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_ai_store_jobs_requester_idx ON admin_ai_store_jobs(requested_by, created_at DESC);
