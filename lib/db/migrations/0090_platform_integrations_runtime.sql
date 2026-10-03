CREATE TABLE IF NOT EXISTS platform_integrations (
  provider text PRIMARY KEY,
  encrypted_secret_key text NOT NULL,
  credential_mode text NOT NULL DEFAULT 'unknown',
  encrypted_webhook_secret text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_integrations_updated_idx
  ON platform_integrations (updated_at DESC);
