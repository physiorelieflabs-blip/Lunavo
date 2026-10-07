-- 0113: supplier sync control plane for connected dropshipping operations
CREATE TABLE IF NOT EXISTS supplier_sync_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_product_id integer NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  sync_price boolean NOT NULL DEFAULT true,
  sync_stock boolean NOT NULL DEFAULT true,
  sync_variants boolean NOT NULL DEFAULT false,
  sync_media boolean NOT NULL DEFAULT false,
  sync_description boolean NOT NULL DEFAULT false,
  max_price_change_bps integer NOT NULL DEFAULT 1500 CHECK (max_price_change_bps >= 0 AND max_price_change_bps <= 100000),
  min_margin_bps integer NOT NULL DEFAULT 1500 CHECK (min_margin_bps >= 0 AND min_margin_bps <= 100000),
  out_of_stock_action text NOT NULL DEFAULT 'pause' CHECK (out_of_stock_action IN ('pause','keep_last','draft')),
  require_price_review boolean NOT NULL DEFAULT true,
  auto_apply boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, supplier_product_id)
);

CREATE INDEX IF NOT EXISTS supplier_sync_policies_enabled_idx
  ON supplier_sync_policies (merchant_id, enabled);

CREATE TABLE IF NOT EXISTS supplier_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_product_id integer NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES supplier_sync_policies(id) ON DELETE SET NULL,
  source_url text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','completed','review_required','failed')),
  changed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  triggered_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS supplier_sync_runs_merchant_time_idx
  ON supplier_sync_runs (merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS supplier_sync_runs_product_time_idx
  ON supplier_sync_runs (supplier_product_id, created_at DESC);
