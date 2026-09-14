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
