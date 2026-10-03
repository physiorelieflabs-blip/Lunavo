-- Migration 0043: Subscription billing window
ALTER TABLE lunavo.subscriptions ADD COLUMN IF NOT EXISTS billing_day_of_month INT DEFAULT 1;
ALTER TABLE lunavo.subscriptions ADD COLUMN IF NOT EXISTS grace_period_days INT DEFAULT 3;
