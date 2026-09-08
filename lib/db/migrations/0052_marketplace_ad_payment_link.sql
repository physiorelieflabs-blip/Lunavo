ALTER TABLE payment_intents
  ADD COLUMN IF NOT EXISTS marketplace_billing_record_id integer REFERENCES marketplace_billing_records(id);

CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_marketplace_billing_unique
  ON payment_intents(marketplace_billing_record_id)
  WHERE marketplace_billing_record_id IS NOT NULL;