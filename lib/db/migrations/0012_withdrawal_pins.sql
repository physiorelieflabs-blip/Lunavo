ALTER TABLE withdrawal_security
  ADD COLUMN IF NOT EXISTS merchant_pin_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS admin_pin_hashes JSONB NOT NULL DEFAULT '[]'::jsonb;