-- Verified incoming merchant sale proceeds are not spendable until Master Admin release.
-- The provider payment is still verified immediately; this table controls release
-- into the merchant's spendable TS Pay ledger and is intentionally separate from
-- customer checkout/payment confirmation.
CREATE TABLE IF NOT EXISTS merchant_fund_release_reviews (
  id BIGSERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK (source_type IN ('order_payment','store_auction','product_auction')),
  source_reference TEXT NOT NULL UNIQUE,
  payment_intent_id INTEGER REFERENCES payment_intents(id) ON DELETE RESTRICT,
  order_id INTEGER REFERENCES orders(id) ON DELETE RESTRICT,
  payment_record_id INTEGER REFERENCES payment_records(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'flutterwave' CHECK (provider = 'flutterwave'),
  provider_transaction_id TEXT NOT NULL,
  provider_reference TEXT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency = upper(currency) AND currency ~ '^[A-Z]{3}$'),
  provider_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (provider_fee_minor >= 0),
  lunavo_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (lunavo_fee_minor >= 0),
  merchant_net_minor BIGINT NOT NULL CHECK (merchant_net_minor >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','released','cancelled','reconciliation_required')),
  review_note TEXT,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  CHECK (provider_fee_minor + lunavo_fee_minor <= amount_minor),
  CHECK (
    (status = 'pending' AND reviewed_at IS NULL) OR
    (status <> 'pending' AND reviewed_at IS NOT NULL)
  ),
  CHECK (
    (source_type = 'order_payment' AND payment_intent_id IS NOT NULL AND order_id IS NOT NULL) OR
    (source_type <> 'order_payment' AND payment_intent_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_fund_release_provider_transaction_unique
  ON merchant_fund_release_reviews (provider, provider_transaction_id);
CREATE INDEX IF NOT EXISTS merchant_fund_release_queue_idx
  ON merchant_fund_release_reviews (status, created_at ASC);
CREATE INDEX IF NOT EXISTS merchant_fund_release_merchant_idx
  ON merchant_fund_release_reviews (merchant_id, currency, status);
