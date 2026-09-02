-- Authoritative payment, immutable ledger, refund, transition and reconciliation
-- records. Manual methods are evidence workflows, not external settlement.
CREATE TABLE IF NOT EXISTS payment_intents (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  order_id INTEGER NOT NULL REFERENCES orders(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3 AND currency = upper(currency)),
  method TEXT NOT NULL CHECK (method IN ('manual_bank_transfer','manual_cash','manual_other')),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','submitted','verified','failed','canceled','refunded','partially_refunded','disputed')),
  idempotency_key TEXT NOT NULL,
  evidence_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_intents_merchant_idempotency_unique UNIQUE (merchant_id, idempotency_key),
  CONSTRAINT payment_intents_order_unique UNIQUE (order_id)
);
CREATE TABLE IF NOT EXISTS payment_records (
  id SERIAL PRIMARY KEY,
  intent_id INTEGER NOT NULL REFERENCES payment_intents(id),
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  order_id INTEGER NOT NULL REFERENCES orders(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3 AND currency = upper(currency)),
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','submitted','verified','failed','canceled','refunded','partially_refunded','disputed')),
  evidence_reference TEXT,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  order_id INTEGER REFERENCES orders(id),
  payment_record_id INTEGER REFERENCES payment_records(id),
  withdrawal_id INTEGER REFERENCES withdrawals(id),
  refund_id INTEGER,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL CHECK (char_length(currency) = 3 AND currency = upper(currency)),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('sale','fee','refund','withdrawal_reserve','withdrawal_release','withdrawal_paid','adjustment')),
  reference_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS refund_records (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  order_id INTEGER NOT NULL REFERENCES orders(id),
  payment_record_id INTEGER NOT NULL REFERENCES payment_records(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3 AND currency = upper(currency)),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','processed','canceled')),
  reason TEXT NOT NULL,
  inventory_restock BOOLEAN NOT NULL DEFAULT false,
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_refund_fk
  FOREIGN KEY (refund_id) REFERENCES refund_records(id);
CREATE TABLE IF NOT EXISTS commerce_transition_history (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  order_id INTEGER REFERENCES orders(id),
  payment_intent_id INTEGER REFERENCES payment_intents(id),
  refund_id INTEGER REFERENCES refund_records(id),
  withdrawal_id INTEGER REFERENCES withdrawals(id),
  entity_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merchant_balance_snapshots (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3 AND currency = upper(currency)),
  ledger_balance_minor INTEGER NOT NULL DEFAULT 0,
  available_balance_minor INTEGER NOT NULL DEFAULT 0,
  held_balance_minor INTEGER NOT NULL DEFAULT 0,
  as_of TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reconciliation_records (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  currency TEXT NOT NULL CHECK (char_length(currency) = 3 AND currency = upper(currency)),
  expected_minor INTEGER NOT NULL,
  observed_minor INTEGER NOT NULL,
  discrepancy_minor INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','void')),
  note TEXT,
  created_by TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_entries_merchant_currency_idx ON ledger_entries(merchant_id, currency, created_at);
CREATE INDEX IF NOT EXISTS transition_history_merchant_idx ON commerce_transition_history(merchant_id, created_at);
CREATE INDEX IF NOT EXISTS reconciliation_merchant_idx ON reconciliation_records(merchant_id, created_at);