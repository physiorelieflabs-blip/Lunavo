CREATE TABLE IF NOT EXISTS admin_ai_store_build_artifacts (
  id bigserial PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES admin_ai_store_jobs(id) ON DELETE CASCADE,
  requested_by text NOT NULL,
  store_name text NOT NULL,
  store_slug text NOT NULL,
  niche text,
  description text,
  brand jsonb NOT NULL DEFAULT '{}'::jsonb,
  catalog jsonb NOT NULL DEFAULT '[]'::jsonb,
  sourcing_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  pricing_strategy jsonb NOT NULL DEFAULT '{}'::jsonb,
  seo jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','published','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id),
  UNIQUE(store_slug)
);
CREATE INDEX IF NOT EXISTS admin_ai_store_build_artifacts_status_idx
  ON admin_ai_store_build_artifacts(status, created_at DESC);
