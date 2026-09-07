-- Persist the one-time dashboard earning window per billing period.
-- This is an access-control state, not a payment balance or bank account.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS dashboard_window_billing_period text,
  ADD COLUMN IF NOT EXISTS dashboard_access_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS dashboard_access_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS dashboard_window_used boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS subscriptions_dashboard_window_idx
  ON subscriptions(merchant_id, dashboard_window_billing_period, dashboard_access_expires_at);

-- Prevent a subscription row from simultaneously claiming multiple dashboard windows
-- for the same billing period. The row itself is authoritative; this index protects
-- future migrations/backfills that might split access state into related records.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_dashboard_window_period_unique
  ON subscriptions(merchant_id, dashboard_window_billing_period)
  WHERE dashboard_window_billing_period IS NOT NULL;
