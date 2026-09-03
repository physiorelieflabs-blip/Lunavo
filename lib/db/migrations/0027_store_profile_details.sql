ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS store_description text,
  ADD COLUMN IF NOT EXISTS store_contact_email text,
  ADD COLUMN IF NOT EXISTS store_phone text,
  ADD COLUMN IF NOT EXISTS store_website text,
  ADD COLUMN IF NOT EXISTS store_address jsonb;