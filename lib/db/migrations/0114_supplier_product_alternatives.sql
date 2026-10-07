-- 0114: supplier mapping and prioritized fallback routing
CREATE TABLE IF NOT EXISTS supplier_product_alternatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  primary_product_id integer NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  alternative_product_id integer NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 100 CHECK (priority > 0),
  enabled boolean NOT NULL DEFAULT true,
  auto_fallback boolean NOT NULL DEFAULT false,
  same_currency_required boolean NOT NULL DEFAULT true,
  min_margin_bps integer NOT NULL DEFAULT 1500 CHECK (min_margin_bps >= 0 AND min_margin_bps <= 100000),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (primary_product_id <> alternative_product_id),
  UNIQUE (merchant_id, primary_product_id, alternative_product_id)
);

CREATE INDEX IF NOT EXISTS supplier_product_alternatives_primary_idx
  ON supplier_product_alternatives (merchant_id, primary_product_id, enabled, priority);
