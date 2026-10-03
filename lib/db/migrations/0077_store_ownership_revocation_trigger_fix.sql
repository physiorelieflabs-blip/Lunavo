-- 0075 intentionally removed the storefront/merchant uniqueness constraint so
-- repeat ownership transfers can be recorded. Replace the old conflict target
-- that depended on that removed constraint.
CREATE OR REPLACE FUNCTION lunavo_revoke_previous_store_owner_access()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.merchant_id IS DISTINCT FROM NEW.merchant_id THEN
    INSERT INTO store_ownership_access_revocations
      (storefront_id, revoked_merchant_id, reason)
    VALUES
      (NEW.id, OLD.merchant_id, 'Store ownership changed; previous owner immediately loses owner-level store access');
  END IF;
  RETURN NEW;
END;
$$;
