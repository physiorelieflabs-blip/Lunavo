ALTER TABLE social_publish_jobs
  ADD COLUMN IF NOT EXISTS publish_options jsonb NOT NULL DEFAULT '{}'::jsonb;
