-- Product discovery advertising is distinct from the monthly marketplace participation fee.
-- A shopper-facing product must have an approved listing and a verified $5 advertising payment.
ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS advertising_fee_amount numeric(12,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS advertising_fee_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS advertising_fee_status text NOT NULL DEFAULT 'due',
  ADD COLUMN IF NOT EXISTS advertising_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS advertising_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS marketplace_listings_advertising_idx
  ON marketplace_listings(advertising_fee_status, advertising_expires_at);
