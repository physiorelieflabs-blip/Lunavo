ALTER TABLE fulfillment_jobs
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

CREATE INDEX IF NOT EXISTS fulfillment_jobs_tracking_idx
  ON fulfillment_jobs(merchant_id, status, updated_at DESC);
