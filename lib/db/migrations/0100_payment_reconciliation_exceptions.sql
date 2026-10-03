CREATE TABLE IF NOT EXISTS payment_reconciliation_exceptions (
  id bigserial PRIMARY KEY,
  provider text NOT NULL,
  event_id text NOT NULL,
  provider_transaction_id text,
  payment_reference text,
  merchant_id integer REFERENCES merchants(id) ON DELETE SET NULL,
  order_id integer REFERENCES orders(id) ON DELETE SET NULL,
  payment_intent_id integer REFERENCES payment_intents(id) ON DELETE SET NULL,
  expected_amount_minor bigint,
  observed_amount_minor bigint,
  expected_currency text,
  observed_currency text,
  reason text NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','ignored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_reconciliation_exceptions_provider_event_uidx
  ON payment_reconciliation_exceptions(provider, event_id);

CREATE INDEX IF NOT EXISTS payment_reconciliation_exceptions_provider_tx_idx
  ON payment_reconciliation_exceptions(provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_reconciliation_exceptions_payment_ref_idx
  ON payment_reconciliation_exceptions(payment_reference)
  WHERE payment_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_reconciliation_exceptions_status_idx
  ON payment_reconciliation_exceptions(status, created_at DESC);
