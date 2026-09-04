ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS public_store_key TEXT,
  ADD COLUMN IF NOT EXISTS storefront_theme JSONB NOT NULL DEFAULT '{"accentColor":"#c85d3f","backgroundColor":"#f5f1e8","textColor":"#182333","layout":"editorial","announcement":""}'::jsonb,
  ADD COLUMN IF NOT EXISTS storefront_sections JSONB NOT NULL DEFAULT '[{"id":"hero","type":"hero","enabled":true,"heading":"Thoughtful goods, clearly presented.","body":""},{"id":"products","type":"products","enabled":true,"heading":"Shop the collection","body":""}]'::jsonb,
  ADD COLUMN IF NOT EXISTS storefront_published BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE merchants
SET public_store_key = md5(random()::text || clock_timestamp()::text || id::text)
WHERE public_store_key IS NULL;

ALTER TABLE merchants
  ALTER COLUMN public_store_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS merchants_public_store_key_unique
  ON merchants (public_store_key);