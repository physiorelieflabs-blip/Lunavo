CREATE TABLE IF NOT EXISTS advertising_payments (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  ai_action_id integer NOT NULL REFERENCES ai_actions(id),
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL,
  method text NOT NULL,
  status text NOT NULL DEFAULT 'pending_review',
  payment_reference text,
  idempotency_key text NOT NULL,
  reviewed_by text,
  review_note text,
  reviewed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS advertising_payments_idempotency_unique
  ON advertising_payments (idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS advertising_payments_reference_unique
  ON advertising_payments (upper(btrim(payment_reference)));

CREATE INDEX IF NOT EXISTS advertising_payments_merchant_created_idx
  ON advertising_payments (merchant_id, created_at);

CREATE INDEX IF NOT EXISTS advertising_payments_action_status_idx
  ON advertising_payments (ai_action_id, status);