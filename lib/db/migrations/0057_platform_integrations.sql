CREATE TABLE IF NOT EXISTS platform_integrations (
  provider text PRIMARY KEY,
  encrypted_secret_key text NOT NULL,
  credential_mode text NOT NULL DEFAULT 'unknown',
  updated_at timestamptz NOT NULL DEFAULT now()
);
