-- 0124: one-time, expiring supplier quote response links.
-- Only token digests are persisted; the raw bearer token is shown once to the merchant.
ALTER TABLE dropship_supplier_quote_requests
  ADD COLUMN IF NOT EXISTS portal_token_hash text,
  ADD COLUMN IF NOT EXISTS portal_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_token_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_token_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_token_revoked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS dropship_supplier_quote_portal_token_unique
  ON dropship_supplier_quote_requests(portal_token_hash)
  WHERE portal_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS dropship_supplier_quote_portal_expiry_idx
  ON dropship_supplier_quote_requests(portal_token_expires_at)
  WHERE portal_token_hash IS NOT NULL AND portal_token_used_at IS NULL AND portal_token_revoked_at IS NULL;
