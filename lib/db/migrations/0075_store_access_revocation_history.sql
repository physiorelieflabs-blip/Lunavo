-- Preserve a complete immutable history when a storefront changes owners more than once.
-- The original UNIQUE(storefront_id, revoked_merchant_id) prevented a later
-- ownership transfer from recording a second revocation for the same merchant.
ALTER TABLE store_ownership_access_revocations
  DROP CONSTRAINT IF EXISTS store_ownership_access_revocations_storefront_id_revoked_merchant_id_key;

CREATE INDEX IF NOT EXISTS store_ownership_access_revocations_history_idx
  ON store_ownership_access_revocations(storefront_id, revoked_merchant_id, revoked_at DESC);

-- Do not let a stale revocation row grant access. Authorization code should
-- always compare the current merchant_storefronts.merchant_id to the caller;
-- these rows are an immutable security/audit record, not an entitlement table.
