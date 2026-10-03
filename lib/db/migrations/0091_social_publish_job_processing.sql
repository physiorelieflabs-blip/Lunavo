ALTER TABLE social_publish_jobs
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS social_publish_jobs_processing_idx
  ON social_publish_jobs (status, locked_at, created_at);
