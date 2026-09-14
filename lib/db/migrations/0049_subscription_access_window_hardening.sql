-- Migration 0049: Subscription enforcement
ALTER TABLE lunavo.subscriptions ADD COLUMN IF NOT EXISTS access_granted_at TIMESTAMPTZ;
ALTER TABLE lunavo.subscriptions ADD COLUMN IF NOT EXISTS access_revoked_at TIMESTAMPTZ;
