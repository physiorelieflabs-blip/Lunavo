-- TS Pay internal transfers are ledger-backed, same-currency and idempotent.
ALTER TABLE ts_pay_transfers
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS ledger_out_reference text,
  ADD COLUMN IF NOT EXISTS ledger_in_reference text;

UPDATE ts_pay_transfers
SET idempotency_key = reference_key
WHERE idempotency_key IS NULL;

ALTER TABLE ts_pay_transfers
  ALTER COLUMN idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ts_pay_transfers_idempotency_unique
  ON ts_pay_transfers (from_merchant_id, idempotency_key);

ALTER TABLE ts_pay_transfers
  ADD CONSTRAINT ts_pay_transfers_different_merchants
  CHECK (from_merchant_id <> to_merchant_id);

ALTER TABLE ts_pay_transfers
  ADD CONSTRAINT ts_pay_transfers_currency_upper
  CHECK (currency = upper(currency) AND char_length(currency) = 3);

CREATE UNIQUE INDEX IF NOT EXISTS ts_pay_transfers_ledger_out_reference_unique
  ON ts_pay_transfers (ledger_out_reference)
  WHERE ledger_out_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ts_pay_transfers_ledger_in_reference_unique
  ON ts_pay_transfers (ledger_in_reference)
  WHERE ledger_in_reference IS NOT NULL;
