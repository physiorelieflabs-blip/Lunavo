ALTER TABLE merchant_storefronts
  ADD COLUMN IF NOT EXISTS ai_creation_job_id bigint;

CREATE UNIQUE INDEX IF NOT EXISTS merchant_storefronts_ai_creation_job_unique
  ON merchant_storefronts(ai_creation_job_id)
  WHERE ai_creation_job_id IS NOT NULL;
