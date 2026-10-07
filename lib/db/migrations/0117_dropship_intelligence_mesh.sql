-- Lunavo connected dropshipping intelligence mesh.
-- These tables store forecast/research/next-best-action evidence without becoming
-- financial, payment, provider, or authoritative inventory sources of truth.

CREATE TABLE IF NOT EXISTS dropship_demand_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_product_id integer NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  location_key text NOT NULL DEFAULT 'global',
  forecast_date date NOT NULL,
  horizon_days integer NOT NULL CHECK (horizon_days BETWEEN 1 AND 180),
  baseline_units_per_day numeric(20,8) NOT NULL DEFAULT 0,
  projected_units numeric(20,8) NOT NULL DEFAULT 0,
  lower_units numeric(20,8) NOT NULL DEFAULT 0,
  upper_units numeric(20,8) NOT NULL DEFAULT 0,
  confidence_bps integer NOT NULL DEFAULT 0 CHECK (confidence_bps BETWEEN 0 AND 10000),
  method text NOT NULL DEFAULT 'deterministic_local'
    CHECK (method IN ('deterministic_local','hybrid_self_hosted','self_hosted_brain')),
  model text,
  recommended_reorder_units integer NOT NULL DEFAULT 0 CHECK (recommended_reorder_units >= 0),
  lead_time_days integer NOT NULL DEFAULT 7 CHECK (lead_time_days BETWEEN 0 AND 365),
  stock_snapshot integer,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, supplier_product_id, location_key, forecast_date, horizon_days)
);

CREATE INDEX IF NOT EXISTS dropship_demand_forecasts_merchant_date_idx
  ON dropship_demand_forecasts(merchant_id, forecast_date DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS dropship_customer_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_count integer NOT NULL DEFAULT 0,
  gross_minor bigint NOT NULL DEFAULT 0,
  average_order_minor bigint NOT NULL DEFAULT 0,
  ltv_minor bigint NOT NULL DEFAULT 0,
  recency_days integer,
  churn_risk_bps integer NOT NULL DEFAULT 0 CHECK (churn_risk_bps BETWEEN 0 AND 10000),
  segment text NOT NULL DEFAULT 'new',
  next_best_action text NOT NULL DEFAULT 'observe',
  marketing_eligible boolean NOT NULL DEFAULT false,
  method text NOT NULL DEFAULT 'deterministic_local',
  model text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, customer_id)
);

CREATE INDEX IF NOT EXISTS dropship_customer_scores_segment_idx
  ON dropship_customer_scores(merchant_id, segment, churn_risk_bps DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS dropship_market_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_product_id integer REFERENCES supplier_products(id) ON DELETE SET NULL,
  source_kind text NOT NULL
    CHECK (source_kind IN ('competitor','ad_spy','trend','supplier','market','pricing')),
  source_url text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  currency text,
  observed_price_minor bigint,
  demand_score integer CHECK (demand_score BETWEEN 0 AND 100),
  competition_score integer CHECK (competition_score BETWEEN 0 AND 100),
  trend_score integer CHECK (trend_score BETWEEN 0 AND 100),
  notes text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_by text NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dropship_market_research_product_idx
  ON dropship_market_research(merchant_id, supplier_product_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS dropship_market_research_kind_idx
  ON dropship_market_research(merchant_id, source_kind, observed_at DESC);
