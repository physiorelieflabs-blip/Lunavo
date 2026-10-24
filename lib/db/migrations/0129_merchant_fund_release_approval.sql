-- Verified incoming merchant sale proceeds are not spendable until Master Admin release.
-- The provider payment is still verified immediately; this table controls release
-- into the merchant's spendable TS Pay ledger and is intentionally separate from
-- customer checkout/payment confirmation.
CREATE TABLE IF NOT EXISTS merchant_fund_release_reviews (
  id BIGSERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK (source_type IN ('order_payment','invoice_payment','store_auction','product_auction')),
  source_reference TEXT NOT NULL UNIQUE,
  payment_intent_id INTEGER REFERENCES payment_intents(id) ON DELETE RESTRICT,
  order_id INTEGER REFERENCES orders(id) ON DELETE RESTRICT,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE RESTRICT,
  payment_record_id INTEGER REFERENCES payment_records(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'flutterwave' CHECK (provider IN ('flutterwave','manual_evidence')),
  provider_transaction_id TEXT NOT NULL,
  provider_reference TEXT,
  provider_amount_minor BIGINT NOT NULL CHECK (provider_amount_minor > 0),
  provider_currency TEXT NOT NULL CHECK (provider_currency = upper(provider_currency) AND provider_currency ~ '^[A-Z]{3}
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency = upper(currency) AND currency ~ '^[A-Z]{3}$'),
  provider_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (provider_fee_minor >= 0),
  lunavo_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (lunavo_fee_minor >= 0),
  merchant_net_minor BIGINT NOT NULL CHECK (merchant_net_minor >= 0),
  held_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (held_amount_minor >= 0),
  legacy_provider_fee_posted_minor BIGINT NOT NULL DEFAULT 0 CHECK (legacy_provider_fee_posted_minor >= 0),
  legacy_lunavo_fee_posted_minor BIGINT NOT NULL DEFAULT 0 CHECK (legacy_lunavo_fee_posted_minor >= 0),
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
    (source_type = 'order_payment' AND payment_intent_id IS NOT NULL AND order_id IS NOT NULL AND invoice_id IS NULL) OR
    (source_type = 'invoice_payment' AND payment_intent_id IS NOT NULL AND invoice_id IS NOT NULL) OR
    (source_type IN ('store_auction','product_auction') AND payment_intent_id IS NULL AND order_id IS NULL AND invoice_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_fund_release_provider_transaction_unique
  ON merchant_fund_release_reviews (provider, provider_transaction_id);
CREATE INDEX IF NOT EXISTS merchant_fund_release_queue_idx
  ON merchant_fund_release_reviews (status, created_at ASC);
CREATE INDEX IF NOT EXISTS merchant_fund_release_merchant_idx
  ON merchant_fund_release_reviews (merchant_id, currency, status);

-- Release decisions are a durable audit record. The only permitted state
-- transition is pending -> released/cancelled/reconciliation_required.
CREATE OR REPLACE FUNCTION lunavo_guard_fund_release_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Merchant fund-release review history is immutable';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'A finalized merchant fund-release review cannot be changed';
  END IF;
  IF NEW.status NOT IN ('released','cancelled','reconciliation_required') THEN
    RAISE EXCEPTION 'Invalid merchant fund-release state transition';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.merchant_id IS DISTINCT FROM OLD.merchant_id
     OR NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
     OR NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
     OR NEW.payment_record_id IS DISTINCT FROM OLD.payment_record_id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id
     OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
     OR NEW.provider_amount_minor IS DISTINCT FROM OLD.provider_amount_minor
     OR NEW.provider_currency IS DISTINCT FROM OLD.provider_currency
     OR NEW.provider_fee_evidence_minor IS DISTINCT FROM OLD.provider_fee_evidence_minor
     OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.provider_fee_minor IS DISTINCT FROM OLD.provider_fee_minor
     OR NEW.lunavo_fee_minor IS DISTINCT FROM OLD.lunavo_fee_minor
     OR NEW.merchant_net_minor IS DISTINCT FROM OLD.merchant_net_minor
     OR NEW.held_amount_minor IS DISTINCT FROM OLD.held_amount_minor
     OR NEW.legacy_provider_fee_posted_minor IS DISTINCT FROM OLD.legacy_provider_fee_posted_minor
     OR NEW.legacy_lunavo_fee_posted_minor IS DISTINCT FROM OLD.legacy_lunavo_fee_posted_minor
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Merchant fund-release source and amount are immutable';
  END IF;
  IF NEW.reviewed_at IS NULL OR NEW.reviewed_by IS NULL THEN
    RAISE EXCEPTION 'Every fund-release decision requires reviewer identity and timestamp';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_fund_release_review_guard ON merchant_fund_release_reviews;
CREATE TRIGGER merchant_fund_release_review_guard
BEFORE UPDATE OR DELETE ON merchant_fund_release_reviews
FOR EACH ROW EXECUTE FUNCTION lunavo_guard_fund_release_review();
),
  provider_fee_evidence_minor BIGINT CHECK (provider_fee_evidence_minor IS NULL OR provider_fee_evidence_minor >= 0),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency = upper(currency) AND currency ~ '^[A-Z]{3}$'),
  provider_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (provider_fee_minor >= 0),
  lunavo_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (lunavo_fee_minor >= 0),
  merchant_net_minor BIGINT NOT NULL CHECK (merchant_net_minor >= 0),
  held_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (held_amount_minor >= 0),
  legacy_provider_fee_posted_minor BIGINT NOT NULL DEFAULT 0 CHECK (legacy_provider_fee_posted_minor >= 0),
  legacy_lunavo_fee_posted_minor BIGINT NOT NULL DEFAULT 0 CHECK (legacy_lunavo_fee_posted_minor >= 0),
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
    (source_type = 'order_payment' AND payment_intent_id IS NOT NULL AND order_id IS NOT NULL AND invoice_id IS NULL) OR
    (source_type = 'invoice_payment' AND payment_intent_id IS NOT NULL AND invoice_id IS NOT NULL) OR
    (source_type IN ('store_auction','product_auction') AND payment_intent_id IS NULL AND order_id IS NULL AND invoice_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_fund_release_provider_transaction_unique
  ON merchant_fund_release_reviews (provider, provider_transaction_id);
CREATE INDEX IF NOT EXISTS merchant_fund_release_queue_idx
  ON merchant_fund_release_reviews (status, created_at ASC);
CREATE INDEX IF NOT EXISTS merchant_fund_release_merchant_idx
  ON merchant_fund_release_reviews (merchant_id, currency, status);

-- Release decisions are a durable audit record. The only permitted state
-- transition is pending -> released/cancelled/reconciliation_required.
CREATE OR REPLACE FUNCTION lunavo_guard_fund_release_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Merchant fund-release review history is immutable';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'A finalized merchant fund-release review cannot be changed';
  END IF;
  IF NEW.status NOT IN ('released','cancelled','reconciliation_required') THEN
    RAISE EXCEPTION 'Invalid merchant fund-release state transition';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.merchant_id IS DISTINCT FROM OLD.merchant_id
     OR NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
     OR NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
     OR NEW.payment_record_id IS DISTINCT FROM OLD.payment_record_id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id
     OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
     OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.provider_fee_minor IS DISTINCT FROM OLD.provider_fee_minor
     OR NEW.lunavo_fee_minor IS DISTINCT FROM OLD.lunavo_fee_minor
     OR NEW.merchant_net_minor IS DISTINCT FROM OLD.merchant_net_minor
     OR NEW.held_amount_minor IS DISTINCT FROM OLD.held_amount_minor
     OR NEW.legacy_provider_fee_posted_minor IS DISTINCT FROM OLD.legacy_provider_fee_posted_minor
     OR NEW.legacy_lunavo_fee_posted_minor IS DISTINCT FROM OLD.legacy_lunavo_fee_posted_minor
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Merchant fund-release source and amount are immutable';
  END IF;
  IF NEW.reviewed_at IS NULL OR NEW.reviewed_by IS NULL THEN
    RAISE EXCEPTION 'Every fund-release decision requires reviewer identity and timestamp';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_fund_release_review_guard ON merchant_fund_release_reviews;
CREATE TRIGGER merchant_fund_release_review_guard
BEFORE UPDATE OR DELETE ON merchant_fund_release_reviews
FOR EACH ROW EXECUTE FUNCTION lunavo_guard_fund_release_review();
