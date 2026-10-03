-- Migration 0036: Payout accounting
ALTER TABLE lunavo.withdrawal_requests ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
ALTER TABLE lunavo.withdrawal_requests ADD COLUMN IF NOT EXISTS settlement_status VARCHAR(50);
ALTER TABLE lunavo.withdrawal_requests ADD COLUMN IF NOT EXISTS settlement_error TEXT;
