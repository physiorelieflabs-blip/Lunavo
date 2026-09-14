-- Migration 0012: Withdrawal security
ALTER TABLE lunavo.merchants ADD COLUMN IF NOT EXISTS withdrawal_pin_hash VARCHAR(255);
ALTER TABLE lunavo.merchants ADD COLUMN IF NOT EXISTS withdrawal_pin_attempts INT DEFAULT 0;
ALTER TABLE lunavo.merchants ADD COLUMN IF NOT EXISTS withdrawal_pin_locked_until TIMESTAMPTZ;
