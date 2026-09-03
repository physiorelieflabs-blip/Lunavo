CREATE TABLE IF NOT EXISTS ts_pay_accounts (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  account_number text NOT NULL UNIQUE,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ts_pay_accounts_merchant_unique
  ON ts_pay_accounts (merchant_id);

CREATE TABLE IF NOT EXISTS ts_pay_transfers (
  id serial PRIMARY KEY,
  from_merchant_id integer NOT NULL REFERENCES merchants(id),
  to_merchant_id integer NOT NULL REFERENCES merchants(id),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  reference_key text NOT NULL UNIQUE,
  note text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS ts_pay_transfers_from_idx
  ON ts_pay_transfers (from_merchant_id, created_at);

CREATE INDEX IF NOT EXISTS ts_pay_transfers_to_idx
  ON ts_pay_transfers (to_merchant_id, created_at);