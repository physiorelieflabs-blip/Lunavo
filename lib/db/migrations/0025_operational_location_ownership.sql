-- Locations are the operational owner of commercial documents.  The fallback
-- location intentionally has no address: ZZ/UTC describes an unknown,
-- worldwide operating site without fabricating customer or merchant data.
UPDATE merchant_locations
SET is_default = false
WHERE is_default = true AND is_active = false;

WITH candidates AS (
  SELECT DISTINCT ON (merchant_id) id
  FROM merchant_locations
  WHERE is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM merchant_locations defaults
      WHERE defaults.merchant_id = merchant_locations.merchant_id
        AND defaults.is_active = true
        AND defaults.is_default = true
    )
  ORDER BY merchant_id, created_at, id
)
UPDATE merchant_locations locations
SET is_default = true
FROM candidates
WHERE locations.id = candidates.id;

INSERT INTO merchant_locations (
  merchant_id, name, location_type, country, currency, timezone, address,
  contact, is_active, is_default
)
SELECT merchants.id, 'Default location', 'default', 'ZZ', merchants.currency,
  'UTC', '{}'::jsonb, '{}'::jsonb, true, true
FROM merchants
WHERE NOT EXISTS (
  SELECT 1 FROM merchant_locations locations
  WHERE locations.merchant_id = merchants.id
    AND locations.is_active = true
    AND locations.is_default = true
);

CREATE OR REPLACE FUNCTION create_merchant_default_location()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO merchant_locations (
    merchant_id, name, location_type, country, currency, timezone, address,
    contact, is_active, is_default
  ) VALUES (
    NEW.id, 'Default location', 'default', 'ZZ', NEW.currency, 'UTC',
    '{}'::jsonb, '{}'::jsonb, true, true
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER merchants_create_default_location
AFTER INSERT ON merchants
FOR EACH ROW EXECUTE FUNCTION create_merchant_default_location();

ALTER TABLE orders ADD COLUMN location_id uuid;
ALTER TABLE invoices ADD COLUMN location_id uuid;
ALTER TABLE inventory_reservations ADD COLUMN location_id uuid;
ALTER TABLE inventory_movements ADD COLUMN location_id uuid;

UPDATE orders
SET location_id = locations.id
FROM merchant_locations locations
WHERE locations.merchant_id = orders.merchant_id
  AND locations.is_active = true
  AND locations.is_default = true;

UPDATE invoices
SET location_id = locations.id
FROM merchant_locations locations
WHERE locations.merchant_id = invoices.merchant_id
  AND locations.is_active = true
  AND locations.is_default = true;

-- Reservation and movement provenance follows its order when present.  Older
-- rows without an order retain a tenant default provenance; these columns stay
-- nullable so imports/history that cannot be attributed are never discarded.
UPDATE inventory_reservations reservations
SET location_id = orders.location_id
FROM orders
WHERE orders.id = reservations.order_id;

UPDATE inventory_movements movements
SET location_id = orders.location_id
FROM orders
WHERE orders.id = movements.order_id;

UPDATE inventory_reservations reservations
SET location_id = locations.id
FROM merchant_locations locations
WHERE reservations.location_id IS NULL
  AND locations.merchant_id = reservations.merchant_id
  AND locations.is_active = true
  AND locations.is_default = true;

UPDATE inventory_movements movements
SET location_id = locations.id
FROM merchant_locations locations
WHERE movements.location_id IS NULL
  AND locations.merchant_id = movements.merchant_id
  AND locations.is_active = true
  AND locations.is_default = true;

ALTER TABLE orders ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE orders ADD CONSTRAINT orders_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES merchant_locations(id);
ALTER TABLE invoices ADD CONSTRAINT invoices_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES merchant_locations(id);
ALTER TABLE inventory_reservations ADD CONSTRAINT inventory_reservations_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES merchant_locations(id);
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES merchant_locations(id);
CREATE INDEX orders_merchant_location_created_idx ON orders(merchant_id, location_id, created_at);
CREATE INDEX invoices_merchant_location_created_idx ON invoices(merchant_id, location_id, created_at);
CREATE INDEX inventory_reservations_merchant_location_idx ON inventory_reservations(merchant_id, location_id);
CREATE INDEX inventory_movements_merchant_location_idx ON inventory_movements(merchant_id, location_id);

-- A role must belong to the same merchant as its membership/invitation.
ALTER TABLE merchant_roles ADD CONSTRAINT merchant_roles_merchant_id_id_unique UNIQUE (merchant_id, id);
ALTER TABLE merchant_memberships ADD CONSTRAINT merchant_memberships_merchant_id_id_unique UNIQUE (merchant_id, id);
ALTER TABLE merchant_invitations ADD CONSTRAINT merchant_invitations_merchant_id_id_unique UNIQUE (merchant_id, id);
ALTER TABLE merchant_memberships ADD CONSTRAINT merchant_memberships_merchant_role_tenant_fkey
  FOREIGN KEY (merchant_id, role_id) REFERENCES merchant_roles(merchant_id, id);
ALTER TABLE merchant_invitations ADD CONSTRAINT merchant_invitations_merchant_role_tenant_fkey
  FOREIGN KEY (merchant_id, role_id) REFERENCES merchant_roles(merchant_id, id);

-- Mapping tables do not carry merchant_id, so a constraint trigger enforces
-- same-tenant location ownership at the database boundary.
CREATE OR REPLACE FUNCTION enforce_location_mapping_tenant()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_merchant_id integer;
  location_merchant_id integer;
BEGIN
  SELECT merchant_id INTO location_merchant_id FROM merchant_locations WHERE id = NEW.location_id;
  IF TG_TABLE_NAME = 'merchant_membership_locations' THEN
    SELECT merchant_id INTO parent_merchant_id FROM merchant_memberships WHERE id = NEW.membership_id;
  ELSE
    SELECT merchant_id INTO parent_merchant_id FROM merchant_invitations WHERE id = NEW.invitation_id;
  END IF;
  IF parent_merchant_id IS NULL OR location_merchant_id IS NULL OR parent_merchant_id <> location_merchant_id THEN
    RAISE EXCEPTION 'location mapping must belong to the same merchant';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER merchant_membership_locations_tenant_check
AFTER INSERT OR UPDATE ON merchant_membership_locations
DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION enforce_location_mapping_tenant();
CREATE CONSTRAINT TRIGGER merchant_invitation_locations_tenant_check
AFTER INSERT OR UPDATE ON merchant_invitation_locations
DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION enforce_location_mapping_tenant();

CREATE OR REPLACE FUNCTION enforce_location_mapping_parent_tenant()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'merchant_memberships' AND EXISTS (
    SELECT 1
    FROM merchant_membership_locations mappings
    JOIN merchant_locations locations ON locations.id = mappings.location_id
    WHERE mappings.membership_id = NEW.id AND locations.merchant_id <> NEW.merchant_id
  ) THEN
    RAISE EXCEPTION 'membership locations must belong to the same merchant';
  ELSIF TG_TABLE_NAME = 'merchant_invitations' AND EXISTS (
    SELECT 1
    FROM merchant_invitation_locations mappings
    JOIN merchant_locations locations ON locations.id = mappings.location_id
    WHERE mappings.invitation_id = NEW.id AND locations.merchant_id <> NEW.merchant_id
  ) THEN
    RAISE EXCEPTION 'invitation locations must belong to the same merchant';
  ELSIF TG_TABLE_NAME = 'merchant_locations' AND (
    EXISTS (
      SELECT 1 FROM merchant_membership_locations mappings
      JOIN merchant_memberships memberships ON memberships.id = mappings.membership_id
      WHERE mappings.location_id = NEW.id AND memberships.merchant_id <> NEW.merchant_id
    ) OR EXISTS (
      SELECT 1 FROM merchant_invitation_locations mappings
      JOIN merchant_invitations invitations ON invitations.id = mappings.invitation_id
      WHERE mappings.location_id = NEW.id AND invitations.merchant_id <> NEW.merchant_id
    )
  ) THEN
    RAISE EXCEPTION 'location mappings must belong to the same merchant';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER merchant_memberships_location_tenant_parent_check
AFTER UPDATE ON merchant_memberships
DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION enforce_location_mapping_parent_tenant();
CREATE CONSTRAINT TRIGGER merchant_invitations_location_tenant_parent_check
AFTER UPDATE ON merchant_invitations
DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION enforce_location_mapping_parent_tenant();
CREATE CONSTRAINT TRIGGER merchant_locations_location_tenant_parent_check
AFTER UPDATE ON merchant_locations
DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION enforce_location_mapping_parent_tenant();