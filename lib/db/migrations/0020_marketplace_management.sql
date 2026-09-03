CREATE TABLE IF NOT EXISTS marketplace_listings (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  supplier_product_id INTEGER NOT NULL REFERENCES supplier_products(id),
  status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT,
  listing_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 5,
  listing_fee_currency TEXT NOT NULL DEFAULT 'USD',
  listing_fee_status TEXT NOT NULL DEFAULT 'due',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_listings_merchant_product_unique UNIQUE (merchant_id, supplier_product_id)
);

CREATE INDEX IF NOT EXISTS marketplace_listings_merchant_status_idx
  ON marketplace_listings (merchant_id, status);

CREATE TABLE IF NOT EXISTS marketplace_billing_records (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  listing_id INTEGER REFERENCES marketplace_listings(id),
  kind TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'due',
  payment_reference TEXT,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS marketplace_billing_merchant_created_idx
  ON marketplace_billing_records (merchant_id, created_at);