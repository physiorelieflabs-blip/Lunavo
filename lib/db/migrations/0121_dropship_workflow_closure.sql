-- 0121: evidenced landed-cost scenarios and supplier quote negotiation workflows.
-- These are advisory/operational records, not inventory commitments or financial ledger entries.

CREATE TABLE IF NOT EXISTS dropship_landed_cost_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_product_id integer REFERENCES supplier_products(id) ON DELETE SET NULL,
  scenario_name text NOT NULL CHECK (length(btrim(scenario_name)) BETWEEN 1 AND 160),
  destination_country text NOT NULL CHECK (destination_country ~ '^[A-Z]{2}$'),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 1000000),
  source_cost_minor bigint NOT NULL CHECK (source_cost_minor >= 0),
  outbound_shipping_minor bigint NOT NULL DEFAULT 0 CHECK (outbound_shipping_minor >= 0),
  freight_minor bigint NOT NULL DEFAULT 0 CHECK (freight_minor >= 0),
  insurance_minor bigint NOT NULL DEFAULT 0 CHECK (insurance_minor >= 0),
  handling_minor bigint NOT NULL DEFAULT 0 CHECK (handling_minor >= 0),
  packaging_minor bigint NOT NULL DEFAULT 0 CHECK (packaging_minor >= 0),
  selling_price_minor bigint NOT NULL CHECK (selling_price_minor >= 0),
  customs_duty_bps integer NOT NULL DEFAULT 0 CHECK (customs_duty_bps BETWEEN 0 AND 10000),
  import_tax_bps integer NOT NULL DEFAULT 0 CHECK (import_tax_bps BETWEEN 0 AND 10000),
  platform_fee_bps integer NOT NULL DEFAULT 100 CHECK (platform_fee_bps BETWEEN 0 AND 10000),
  provider_fee_bps integer NOT NULL DEFAULT 0 CHECK (provider_fee_bps BETWEEN 0 AND 10000),
  returns_reserve_bps integer NOT NULL DEFAULT 0 CHECK (returns_reserve_bps BETWEEN 0 AND 10000),
  dutiable_base_minor bigint NOT NULL CHECK (dutiable_base_minor >= 0),
  customs_duty_minor bigint NOT NULL CHECK (customs_duty_minor >= 0),
  import_tax_base_minor bigint NOT NULL CHECK (import_tax_base_minor >= 0),
  import_tax_minor bigint NOT NULL CHECK (import_tax_minor >= 0),
  landed_cost_minor bigint NOT NULL CHECK (landed_cost_minor >= 0),
  platform_fee_minor bigint NOT NULL CHECK (platform_fee_minor >= 0),
  provider_fee_minor bigint NOT NULL CHECK (provider_fee_minor >= 0),
  returns_reserve_minor bigint NOT NULL CHECK (returns_reserve_minor >= 0),
  contribution_margin_minor bigint NOT NULL,
  contribution_margin_bps integer NOT NULL CHECK (contribution_margin_bps BETWEEN -100000 AND 10000),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculation_version text NOT NULL DEFAULT 'landed-cost-v1',
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dropship_landed_cost_scenarios_merchant_created_idx
  ON dropship_landed_cost_scenarios(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dropship_landed_cost_scenarios_product_idx
  ON dropship_landed_cost_scenarios(merchant_id, supplier_product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dropship_supplier_quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_product_id integer REFERENCES supplier_products(id) ON DELETE SET NULL,
  supplier_name text,
  product_title text NOT NULL CHECK (length(btrim(product_title)) BETWEEN 1 AND 240),
  sku text,
  source_url text,
  destination_country text NOT NULL CHECK (destination_country ~ '^[A-Z]{2}$'),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 1000000),
  target_unit_price_minor bigint CHECK (target_unit_price_minor >= 0),
  desired_delivery_days integer CHECK (desired_delivery_days BETWEEN 1 AND 365),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','quoted','accepted','rejected','cancelled','expired')),
  quoted_unit_price_minor bigint CHECK (quoted_unit_price_minor >= 0),
  quoted_shipping_minor bigint CHECK (quoted_shipping_minor >= 0),
  quoted_total_minor bigint CHECK (quoted_total_minor >= 0),
  quoted_delivery_days integer CHECK (quoted_delivery_days BETWEEN 1 AND 365),
  quote_expires_at timestamptz,
  request_notes text,
  quote_notes text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(merchant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS dropship_supplier_quote_requests_merchant_status_idx
  ON dropship_supplier_quote_requests(merchant_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS dropship_supplier_quote_requests_product_idx
  ON dropship_supplier_quote_requests(merchant_id, supplier_product_id, created_at DESC);
