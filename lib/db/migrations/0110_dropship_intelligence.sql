-- Migration 0110: self-hosted Dropship Intelligence OS.
-- These tables store merchant observations and derived controls only. They never
-- pretend to be live carrier/supplier data when a provider integration is absent.

CREATE TABLE IF NOT EXISTS dropship_supplier_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_product_id integer REFERENCES supplier_products(id) ON DELETE SET NULL,
  supplier_domain text NOT NULL,
  supplier_name text,
  source_url text,
  destination_country text,
  observed_cost_minor bigint CHECK (observed_cost_minor IS NULL OR observed_cost_minor >= 0),
  shipping_cost_minor bigint CHECK (shipping_cost_minor IS NULL OR shipping_cost_minor >= 0),
  currency text NOT NULL CHECK (currency = upper(currency) AND char_length(currency) = 3),
  eta_min_days integer CHECK (eta_min_days IS NULL OR eta_min_days BETWEEN 0 AND 365),
  eta_max_days integer CHECK (eta_max_days IS NULL OR eta_max_days BETWEEN 0 AND 365),
  quality_score integer CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 100),
  tracking_score integer CHECK (tracking_score IS NULL OR tracking_score BETWEEN 0 AND 100),
  defect_rate_bps integer CHECK (defect_rate_bps IS NULL OR defect_rate_bps BETWEEN 0 AND 10000),
  refund_rate_bps integer CHECK (refund_rate_bps IS NULL OR refund_rate_bps BETWEEN 0 AND 10000),
  notes text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dropship_supplier_observations_merchant_domain_idx
  ON dropship_supplier_observations(merchant_id, supplier_domain, observed_at DESC);
CREATE INDEX IF NOT EXISTS dropship_supplier_observations_product_idx
  ON dropship_supplier_observations(merchant_id, supplier_product_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS dropship_product_guardrails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_product_id integer NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  ad_spend_per_order_minor bigint CHECK (ad_spend_per_order_minor IS NULL OR ad_spend_per_order_minor >= 0),
  target_margin_bps integer NOT NULL DEFAULT 2000 CHECK (target_margin_bps BETWEEN 0 AND 9000),
  max_delivery_days integer CHECK (max_delivery_days IS NULL OR max_delivery_days BETWEEN 0 AND 365),
  max_supplier_cost_minor bigint CHECK (max_supplier_cost_minor IS NULL OR max_supplier_cost_minor >= 0),
  max_shipping_cost_minor bigint CHECK (max_shipping_cost_minor IS NULL OR max_shipping_cost_minor >= 0),
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('live','watch','paused')),
  decision text NOT NULL DEFAULT 'TEST' CHECK (decision IN ('SCALE','TEST','FIX','PAUSE')),
  viability_score integer CHECK (viability_score IS NULL OR viability_score BETWEEN 0 AND 100),
  break_even_cpa_minor bigint,
  break_even_roas_x100 integer,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(merchant_id, supplier_product_id)
);
CREATE INDEX IF NOT EXISTS dropship_product_guardrails_status_idx
  ON dropship_product_guardrails(merchant_id, status, decision, updated_at DESC);

CREATE TABLE IF NOT EXISTS dropship_tracking_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier text,
  tracking_number text,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown','label_created','shipped','in_transit','delivered','exception','returned')),
  first_scan_at timestamptz,
  last_recorded_at timestamptz,
  expected_delivery_at timestamptz,
  delivered_at timestamptz,
  last_recorded_event text,
  customer_message_sent_at timestamptz,
  note text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(merchant_id, order_id)
);
CREATE INDEX IF NOT EXISTS dropship_tracking_checkpoints_gap_idx
  ON dropship_tracking_checkpoints(merchant_id, status, last_recorded_at);

CREATE TABLE IF NOT EXISTS dropship_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  kind text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','high','critical')),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(merchant_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS dropship_alerts_merchant_status_idx
  ON dropship_alerts(merchant_id, status, severity, updated_at DESC);
