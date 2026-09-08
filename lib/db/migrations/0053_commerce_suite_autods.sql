-- Commerce suite: opt-in Auto-DS orchestration and high-value commerce features.
CREATE TABLE IF NOT EXISTS auto_ds_settings (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'assisted',
  auto_allocate_supplier_cost boolean NOT NULL DEFAULT false,
  require_approval_before_external_order boolean NOT NULL DEFAULT true,
  minimum_margin_percent numeric(8,2) NOT NULL DEFAULT 10,
  default_carrier text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fulfillment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id integer NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  supplier_product_id integer REFERENCES supplier_products(id) ON DELETE SET NULL,
  mode text NOT NULL DEFAULT 'assisted',
  status text NOT NULL DEFAULT 'ready',
  supplier_order_reference text,
  supplier_checkout_url text,
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_minor integer,
  currency text,
  last_error text,
  attempts integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS fulfillment_jobs_merchant_status_idx ON fulfillment_jobs(merchant_id, status, created_at);
CREATE TABLE IF NOT EXISTS customer_wishlists (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  supplier_product_id integer NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, customer_id, supplier_product_id)
);
CREATE TABLE IF NOT EXISTS customer_saved_carts (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Saved cart',
  cart_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, customer_id, name)
);
CREATE TABLE IF NOT EXISTS discount_codes (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  code text NOT NULL,
  kind text NOT NULL DEFAULT 'percentage',
  value numeric(12,2) NOT NULL,
  minimum_subtotal numeric(12,2) NOT NULL DEFAULT 0,
  currency text,
  usage_limit integer,
  usage_count integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, code)
);
CREATE INDEX IF NOT EXISTS discount_codes_merchant_active_idx ON discount_codes(merchant_id, active, code);
CREATE TABLE IF NOT EXISTS gift_cards (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  code_last4 text NOT NULL,
  initial_amount_minor integer NOT NULL,
  balance_minor integer NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  recipient_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  points_balance integer NOT NULL DEFAULT 0,
  lifetime_points integer NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, customer_id)
);
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id integer REFERENCES orders(id) ON DELETE SET NULL,
  points_delta integer NOT NULL,
  reason text NOT NULL,
  reference_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS affiliate_offers (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_product_id integer NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'review',
  commission_bps integer NOT NULL DEFAULT 3000,
  destination_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, supplier_product_id)
);
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id integer NOT NULL REFERENCES affiliate_offers(id) ON DELETE CASCADE,
  affiliate_key text NOT NULL,
  session_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS affiliate_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id integer NOT NULL REFERENCES affiliate_offers(id) ON DELETE CASCADE,
  order_id integer REFERENCES orders(id) ON DELETE SET NULL,
  affiliate_key text NOT NULL,
  commission_minor integer NOT NULL DEFAULT 0,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS digital_products (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_product_id integer REFERENCES supplier_products(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'digital',
  access_mode text NOT NULL DEFAULT 'purchase',
  drip_enabled boolean NOT NULL DEFAULT false,
  certificate_enabled boolean NOT NULL DEFAULT false,
  curriculum_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS digital_assets (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  digital_product_id integer NOT NULL REFERENCES digital_products(id) ON DELETE CASCADE,
  title text NOT NULL,
  asset_type text NOT NULL,
  storage_key text,
  external_url text,
  downloadable boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS course_sections (
  id serial PRIMARY KEY,
  digital_product_id integer NOT NULL REFERENCES digital_products(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS course_lessons (
  id serial PRIMARY KEY,
  section_id integer NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  video_url text,
  duration_seconds integer,
  preview boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS customer_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  digital_product_id integer NOT NULL REFERENCES digital_products(id) ON DELETE CASCADE,
  order_id integer REFERENCES orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  progress_percent integer NOT NULL DEFAULT 0,
  granted_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (merchant_id, customer_id, digital_product_id)
);
INSERT INTO _ts_commerce_migrations (id) VALUES ('0053_commerce_suite_autods') ON CONFLICT (id) DO NOTHING;
