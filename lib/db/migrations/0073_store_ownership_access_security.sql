-- Store ownership transfer must revoke prior owner store access immediately.
CREATE TABLE IF NOT EXISTS store_ownership_access_revocations (
  id bigserial PRIMARY KEY,
  storefront_id uuid NOT NULL REFERENCES merchant_storefronts(id) ON DELETE CASCADE,
  revoked_merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  transfer_id bigint REFERENCES store_ownership_transfers(id) ON DELETE SET NULL,
  reason text NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storefront_id, revoked_merchant_id)
);
CREATE INDEX IF NOT EXISTS store_ownership_access_revocations_store_idx ON store_ownership_access_revocations(storefront_id, revoked_at DESC);
