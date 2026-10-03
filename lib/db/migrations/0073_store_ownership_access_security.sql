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
CREATE OR REPLACE FUNCTION lunavo_revoke_previous_store_owner_access() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.merchant_id IS DISTINCT FROM NEW.merchant_id THEN
    INSERT INTO store_ownership_access_revocations (storefront_id,revoked_merchant_id,reason)
    VALUES (NEW.id,OLD.merchant_id,'Store ownership changed; previous owner immediately loses owner-level store access')
    ON CONFLICT (storefront_id,revoked_merchant_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS merchant_storefront_owner_access_revocation ON merchant_storefronts;
CREATE TRIGGER merchant_storefront_owner_access_revocation AFTER UPDATE OF merchant_id ON merchant_storefronts FOR EACH ROW EXECUTE FUNCTION lunavo_revoke_previous_store_owner_access();
