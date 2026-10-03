CREATE TABLE IF NOT EXISTS local_auth_email_verifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES local_auth_users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_auth_email_verifications_user_idx
  ON local_auth_email_verifications (user_id, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS local_auth_email_verifications_active_uidx
  ON local_auth_email_verifications (user_id)
  WHERE consumed_at IS NULL;
