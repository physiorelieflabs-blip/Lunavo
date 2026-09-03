CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE merchant_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id),
  name text NOT NULL,
  location_type text NOT NULL DEFAULT 'store',
  country text NOT NULL,
  currency text NOT NULL,
  timezone text NOT NULL,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  supports_fulfillment boolean NOT NULL DEFAULT false,
  supports_pos boolean NOT NULL DEFAULT false,
  supports_inventory boolean NOT NULL DEFAULT false,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX merchant_locations_merchant_active_idx ON merchant_locations(merchant_id, is_active);
CREATE UNIQUE INDEX merchant_locations_one_default_unique ON merchant_locations(merchant_id) WHERE is_default;

CREATE TABLE merchant_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id),
  key text NOT NULL,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(merchant_id, key)
);
CREATE TABLE merchant_role_permissions (
  role_id uuid NOT NULL REFERENCES merchant_roles(id) ON DELETE CASCADE,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role_id, permission)
);
CREATE TABLE merchant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id),
  clerk_user_id text NOT NULL,
  role_id uuid NOT NULL REFERENCES merchant_roles(id),
  status text NOT NULL DEFAULT 'active',
  invited_by text,
  accepted_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(merchant_id, clerk_user_id)
);
CREATE INDEX merchant_memberships_clerk_status_idx ON merchant_memberships(clerk_user_id, status);
CREATE TABLE merchant_membership_locations (
  membership_id uuid NOT NULL REFERENCES merchant_memberships(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES merchant_locations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(membership_id, location_id)
);
CREATE TABLE merchant_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id),
  email text NOT NULL,
  role_id uuid NOT NULL REFERENCES merchant_roles(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  invited_by text NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  accepted_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX merchant_invitations_merchant_email_idx ON merchant_invitations(merchant_id, email);
CREATE UNIQUE INDEX merchant_invitations_active_email_unique
  ON merchant_invitations(merchant_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE TABLE merchant_invitation_locations (
  invitation_id uuid NOT NULL REFERENCES merchant_invitations(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES merchant_locations(id) ON DELETE CASCADE,
  UNIQUE(invitation_id, location_id)
);