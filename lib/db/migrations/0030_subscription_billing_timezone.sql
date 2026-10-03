-- Migration 0030: Billing timezone support
ALTER TABLE lunavo.merchants ADD COLUMN IF NOT EXISTS billing_timezone VARCHAR(50) DEFAULT 'UTC';
ALTER TABLE lunavo.subscriptions ADD COLUMN IF NOT EXISTS billing_timezone VARCHAR(50) DEFAULT 'UTC';
