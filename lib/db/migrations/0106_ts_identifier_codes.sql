-- Migration 0106: TS identification codes
-- Identification codes are durable identifiers only. They are never payment
-- destinations, bank accounts, wallet addresses, credentials, or balances.
CREATE TABLE IF NOT EXISTS ts_merchant_admin_codes (
  merchant_id integer PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ts_store_codes (
  storefront_id uuid PRIMARY KEY REFERENCES merchant_storefronts(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ts_customer_codes (
  customer_id integer PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ts_platform_codes (
  scope text PRIMARY KEY CHECK (scope = 'global'),
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ts_merchant_admin_codes IS 'TS identifiers only; never a bank/payment destination.';
COMMENT ON TABLE ts_store_codes IS 'TS identifiers only; never a bank/payment destination.';
COMMENT ON TABLE ts_customer_codes IS 'TS identifiers only; never a bank/payment destination.';
COMMENT ON TABLE ts_platform_codes IS 'TS identifiers only; never a bank/payment destination.';
