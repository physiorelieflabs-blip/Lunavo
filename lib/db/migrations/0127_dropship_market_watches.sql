-- 0127: tenant-scoped scheduled competitor/ad-spy market observations.
-- Observations are public-page evidence only. They never mutate catalog price, stock, orders or payments.
CREATE TABLE IF NOT EXISTS dropship_market_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_product_id integer REFERENCES supplier_products(id) ON DELETE SET NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('competitor','ad_spy')),
  source_url text NOT NULL CHECK (length(btrim(source_url)) BETWEEN 8 AND 2048),
  interval_minutes integer NOT NULL DEFAULT 360 CHECK (interval_minutes BETWEEN 60 AND 1440),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','failed')),
  last_observation_id uuid REFERENCES dropship_market_research(id) ON DELETE SET NULL,
  last_observed_title text,
  last_observed_currency text CHECK (last_observed_currency IS NULL OR last_observed_currency ~ '^[A-Z]{3}$'),
  last_observed_price_minor bigint CHECK (last_observed_price_minor IS NULL OR last_observed_price_minor >= 0),
  last_observed_availability text,
  last_checked_at timestamptz,
  next_capture_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures BETWEEN 0 AND 1000000),
  capture_count bigint NOT NULL DEFAULT 0 CHECK (capture_count >= 0),
  claim_token uuid,
  locked_at timestamptz,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 120),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS dropship_market_watches_due_idx
  ON dropship_market_watches(status, next_capture_at, locked_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS dropship_market_watches_merchant_idx
  ON dropship_market_watches(merchant_id, created_at DESC);
