ALTER TABLE payment_intents
  ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE payment_intents
  ADD COLUMN IF NOT EXISTS invoice_payment_submission_id integer
  REFERENCES invoice_payment_submissions(id);

CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_invoice_submission_unique
  ON payment_intents(invoice_payment_submission_id);

ALTER TABLE payment_records
  ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE payment_records
  ADD COLUMN IF NOT EXISTS invoice_payment_submission_id integer
  REFERENCES invoice_payment_submissions(id);

ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS invoice_id integer
  REFERENCES invoices(id);