-- Critical payment/referral hardening.
-- These records are reconciliation evidence, never a bank account or payment destination.

ALTER TABLE payment_intents
  DROP CONSTRAINT IF EXISTS payment_intents_status_check;
ALTER TABLE payment_intents
  ADD CONSTRAINT payment_intents_status_check
  CHECK (status IN (
    'created','awaiting_payment','pending','processing','provider_confirmed',
    'successful','failed','expired','cancelled','refunded','partially_refunded',
    'disputed','charged_back','reversed','reconciliation_required',
    'submitted','verified','canceled'
  ));

ALTER TABLE payment_records
  DROP CONSTRAINT IF EXISTS payment_records_status_check;
ALTER TABLE payment_records
  ADD CONSTRAINT payment_records_status_check
  CHECK (status IN (
    'created','awaiting_payment','pending','processing','provider_confirmed',
    'successful','failed','expired','cancelled','refunded','partially_refunded',
    'disputed','charged_back','reversed','reconciliation_required',
    'submitted','verified','canceled'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS payment_records_verified_intent_unique
  ON payment_records(intent_id)
  WHERE status IN ('provider_confirmed','successful','verified');

CREATE UNIQUE INDEX IF NOT EXISTS payment_records_verified_evidence_unique
  ON payment_records(method, evidence_reference)
  WHERE evidence_reference IS NOT NULL
    AND status IN ('provider_confirmed','successful','verified');

CREATE TABLE IF NOT EXISTS payment_reconciliation_exceptions (
  id serial PRIMARY KEY,
  provider text NOT NULL,
  event_id text NOT NULL,
  provider_transaction_id text,
  payment_reference text,
  merchant_id integer REFERENCES merchants(id),
  order_id integer REFERENCES orders(id),
  payment_intent_id integer REFERENCES payment_intents(id),
  expected_amount_minor integer,
  observed_amount_minor integer,
  expected_currency text,
  observed_currency text,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','investigating','resolved','ignored')),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  UNIQUE (provider, event_id)
);
CREATE INDEX IF NOT EXISTS payment_reconciliation_exceptions_provider_tx_idx
  ON payment_reconciliation_exceptions(provider, provider_transaction_id);
CREATE INDEX IF NOT EXISTS payment_reconciliation_exceptions_merchant_status_idx
  ON payment_reconciliation_exceptions(merchant_id, status, created_at);
CREATE INDEX IF NOT EXISTS payment_reconciliation_exceptions_open_idx
  ON payment_reconciliation_exceptions(status, created_at)
  WHERE status IN ('open','investigating');
