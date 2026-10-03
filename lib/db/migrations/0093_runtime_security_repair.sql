CREATE TABLE IF NOT EXISTS local_auth_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  username text NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  password_hash text NOT NULL,
  email_verified boolean NOT NULL DEFAULT true,
  role text NOT NULL DEFAULT 'merchant',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS local_auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES local_auth_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS local_auth_sessions_user_idx ON local_auth_sessions (user_id, expires_at);
CREATE INDEX IF NOT EXISTS local_auth_sessions_expiry_idx ON local_auth_sessions (expires_at);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS local_auth_user_id uuid REFERENCES local_auth_users(id);
CREATE UNIQUE INDEX IF NOT EXISTS merchants_local_auth_user_uidx ON merchants (local_auth_user_id) WHERE local_auth_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS local_auth_password_resets (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES local_auth_users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS local_auth_password_resets_user_idx ON local_auth_password_resets (user_id, expires_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  merchant_id text,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_merchant_created_idx ON audit_logs (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_user_created_idx ON audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_created_idx ON audit_logs (action, created_at DESC);

CREATE TABLE IF NOT EXISTS master_admin_security (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES local_auth_users(id) ON DELETE CASCADE,
  totp_secret_ciphertext text,
  pending_totp_secret_ciphertext text,
  pending_totp_expires_at timestamptz,
  enabled_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_used_step bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS master_admin_mfa_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES local_auth_users(id) ON DELETE CASCADE,
  challenge_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS master_admin_mfa_challenges_user_idx ON master_admin_mfa_challenges(user_id, expires_at);

ALTER TABLE fulfillment_jobs
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
CREATE INDEX IF NOT EXISTS fulfillment_jobs_tracking_idx ON fulfillment_jobs(merchant_id, status, updated_at DESC);
