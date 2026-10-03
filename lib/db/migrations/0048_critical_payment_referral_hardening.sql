-- Migration 0048: Critical payment integrity
ALTER TABLE lunavo.transactions ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE;
ALTER TABLE lunavo.transactions ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
CREATE INDEX idx_transactions_locked ON lunavo.transactions(locked);
