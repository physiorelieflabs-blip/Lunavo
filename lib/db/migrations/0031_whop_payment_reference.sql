-- Migration 0031: Provider payment tracking
ALTER TABLE lunavo.transactions ADD COLUMN IF NOT EXISTS provider_transaction_id VARCHAR(255);
ALTER TABLE lunavo.transactions ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
