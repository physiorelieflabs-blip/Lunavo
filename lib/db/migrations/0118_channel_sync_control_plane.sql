-- Lunavo multi-channel and synchronization control plane.
-- External channels are adapters, never alternate sources of financial truth.

CREATE TABLE IF NOT EXISTS merchant_channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN (
    'shopify','woocommerce','etsy','amazon','tiktok_shop','wix','squarespace','custom'
  )),
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','connected','degraded','paused','revoked','error'
  )),
  credential_ref text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  webhook_secret_hash text,
  store_url text,
  external_account_ref text,
  sync_products boolean NOT NULL DEFAULT true,
  sync_inventory boolean NOT NULL DEFAULT true,
  sync_orders boolean NOT NULL DEFAULT true,
  sync_fulfillment boolean NOT NULL DEFAULT true,
  sync_pricing boolean NOT NULL DEFAULT true,
  last_product_sync_at timestamptz,
  last_inventory_sync_at timestamptz,
  last_order_sync_at timestamptz,
  last_fulfillment_sync_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_channel_connections_name_unique
  ON merchant_channel_connections(merchant_id, lower(display_name));
CREATE INDEX IF NOT EXISTS merchant_channel_connections_provider_idx
  ON merchant_channel_connections(merchant_id, provider, status);

CREATE TABLE IF NOT EXISTS merchant_channel_product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES merchant_channel_connections(id) ON DELETE CASCADE,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_product_id integer REFERENCES supplier_products(id) ON DELETE SET NULL,
  external_product_id text NOT NULL,
  external_variant_id text,
  last_source_hash text,
  last_published_hash text,
  last_seen_at timestamptz,
  last_published_at timestamptz,
  status text NOT NULL DEFAULT 'mapped' CHECK (status IN ('mapped','pending','conflict','disabled')),
  conflict_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(connection_id, external_product_id, external_variant_id)
);

CREATE INDEX IF NOT EXISTS merchant_channel_product_mappings_product_idx
  ON merchant_channel_product_mappings(merchant_id, supplier_product_id, status);

CREATE TABLE IF NOT EXISTS merchant_channel_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES merchant_channel_connections(id) ON DELETE CASCADE,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('pull','push')),
  resource text NOT NULL CHECK (resource IN (
    'products','inventory','pricing','orders','fulfillment','returns'
  )),
  scope text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued','running','succeeded','partial','failed','cancelled'
  )),
  idempotency_key text NOT NULL,
  requested_by text NOT NULL,
  correlation_id text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  next_attempt_at timestamptz,
  last_error text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS merchant_channel_sync_jobs_queue_idx
  ON merchant_channel_sync_jobs(status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS merchant_channel_sync_jobs_connection_idx
  ON merchant_channel_sync_jobs(connection_id, created_at DESC);
