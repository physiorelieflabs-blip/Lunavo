ALTER TABLE local_auth_users
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS login_locked_until timestamptz;

CREATE INDEX IF NOT EXISTS local_auth_users_login_lock_idx
  ON local_auth_users (login_locked_until)
  WHERE login_locked_until IS NOT NULL;
