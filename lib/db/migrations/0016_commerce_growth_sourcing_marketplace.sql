CREATE TABLE IF NOT EXISTS sourcing_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL,
  source_url text NOT NULL,
  canonical_url text,
  domain text,
  source_type text NOT NULL DEFAULT 'product_url',
  status text NOT NULL DEFAULT 'active',
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sourcing_sources_merchant_idx ON sourcing_sources (merchant_id, status);

CREATE TABLE IF NOT EXISTS sourcing_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL,
  source_id uuid NOT NULL REFERENCES sourcing_sources(id) ON DELETE CASCADE,
  source_product_key text,
  title text NOT NULL,
  description text,
  source_currency text,
  source_price_minor integer,
  source_availability text,
  source_sku text,
  variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  specifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_score integer,
  opportunity_score integer,
  status text NOT NULL DEFAULT 'review',
  imported_product_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sourcing_products_merchant_status_idx ON sourcing_products (merchant_id, status);
CREATE INDEX IF NOT EXISTS sourcing_products_opportunity_idx ON sourcing_products (merchant_id, opportunity_score);

CREATE TABLE IF NOT EXISTS sourcing_price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sourcing_product_id uuid NOT NULL REFERENCES sourcing_products(id) ON DELETE CASCADE,
  source_price_minor integer NOT NULL,
  currency text NOT NULL,
  availability text,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sourcing_price_snapshots_product_time_idx ON sourcing_price_snapshots (sourcing_product_id, captured_at);

CREATE TABLE IF NOT EXISTS product_advertising_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL,
  store_id uuid,
  product_id integer NOT NULL,
  fee_minor integer NOT NULL DEFAULT 500,
  currency text NOT NULL DEFAULT 'USD',
  payment_status text NOT NULL DEFAULT 'pending',
  payment_transaction_id integer,
  payment_reference text,
  status text NOT NULL DEFAULT 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  budget_minor integer,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  product_views integer NOT NULL DEFAULT 0,
  add_to_carts integer NOT NULL DEFAULT 0,
  purchases integer NOT NULL DEFAULT 0,
  attributed_revenue_minor integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_ads_merchant_status_idx ON product_advertising_campaigns (merchant_id, status);
CREATE INDEX IF NOT EXISTS product_ads_product_status_idx ON product_advertising_campaigns (product_id, status);

CREATE TABLE IF NOT EXISTS marketplace_discovery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id integer NOT NULL,
  campaign_id uuid REFERENCES product_advertising_campaigns(id) ON DELETE SET NULL,
  customer_id integer,
  event_type text NOT NULL,
  session_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_events_product_time_idx ON marketplace_discovery_events (product_id, created_at);
CREATE INDEX IF NOT EXISTS marketplace_events_campaign_idx ON marketplace_discovery_events (campaign_id);

CREATE TABLE IF NOT EXISTS commerce_growth_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL,
  type text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  score integer,
  title text NOT NULL,
  explanation text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_action jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS growth_opportunities_merchant_status_idx ON commerce_growth_opportunities (merchant_id, status);

CREATE TABLE IF NOT EXISTS store_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL,
  score integer NOT NULL,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_health_checks_merchant_time_idx ON store_health_checks (merchant_id, generated_at);

-- Migration marker is used by the existing production migration runner.
INSERT INTO _ts_commerce_migrations (id) VALUES ('0016_commerce_growth_sourcing_marketplace') ON CONFLICT (id) DO NOTHING;
