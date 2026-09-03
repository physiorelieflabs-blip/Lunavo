CREATE TABLE IF NOT EXISTS payment_links (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  token TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_links_merchant_status_idx
  ON payment_links (merchant_id, status);