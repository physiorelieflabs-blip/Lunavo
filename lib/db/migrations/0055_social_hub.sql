-- Optional social account connections, user-owned campaign media, and publish jobs.
CREATE TABLE IF NOT EXISTS social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  account_id text,
  account_name text,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'connected',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS social_connections_merchant_provider_account_unique ON social_connections(merchant_id, provider, account_id);
CREATE INDEX IF NOT EXISTS social_connections_merchant_status_idx ON social_connections(merchant_id, status);

CREATE TABLE IF NOT EXISTS ad_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime_type text NOT NULL,
  media_type text NOT NULL,
  byte_size integer NOT NULL,
  media_data text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_media_assets_merchant_created_idx ON ad_media_assets(merchant_id, created_at);

CREATE TABLE IF NOT EXISTS social_publish_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  connection_id uuid,
  creative_id uuid,
  ad_media_asset_id uuid,
  provider text NOT NULL,
  caption text,
  status text NOT NULL DEFAULT 'queued',
  external_post_id text,
  error_message text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS social_publish_jobs_idempotency_unique ON social_publish_jobs(merchant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS social_publish_jobs_merchant_created_idx ON social_publish_jobs(merchant_id, created_at);

INSERT INTO _ts_commerce_migrations (id)
VALUES ('0055_social_hub')
ON CONFLICT (id) DO NOTHING;
