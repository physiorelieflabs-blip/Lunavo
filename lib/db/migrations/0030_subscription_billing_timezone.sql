ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS billing_timezone text;