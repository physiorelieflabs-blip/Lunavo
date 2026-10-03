ALTER TABLE local_auth_sessions
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text;

CREATE INDEX IF NOT EXISTS local_auth_sessions_last_seen_idx
  ON local_auth_sessions (user_id, last_seen_at DESC);
