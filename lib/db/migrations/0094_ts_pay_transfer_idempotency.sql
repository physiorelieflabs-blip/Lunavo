-- Migration 0094: TS Pay transfer idempotency key
ALTER TABLE ts_pay_transfers ADD COLUMN IF NOT EXISTS idempotency_key text;
UPDATE ts_pay_transfers SET idempotency_key = reference_key WHERE idempotency_key IS NULL;
ALTER TABLE ts_pay_transfers ALTER COLUMN idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ts_pay_transfers_merchant_idempotency_unique ON ts_pay_transfers (from_merchant_id, idempotency_key);
