CREATE TABLE IF NOT EXISTS merchant_storefronts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  public_key text NOT NULL UNIQUE,
  description text,
  theme jsonb NOT NULL DEFAULT '{"accentColor":"#c85d3f","backgroundColor":"#f5f1e8","textColor":"#182333","layout":"editorial","announcement":"","logoUrl":null,"heroImageUrl":null}'::jsonb,
  sections jsonb NOT NULL DEFAULT '[{"id":"hero","type":"hero","enabled":true,"heading":"Thoughtful goods, clearly presented.","body":""},{"id":"products","type":"products","enabled":true,"heading":"Shop the collection","body":""}]'::jsonb,
  published boolean NOT NULL DEFAULT false,
  created_by_clerk_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS merchant_storefronts_merchant_slug_unique
  ON merchant_storefronts(merchant_id, slug);
CREATE INDEX IF NOT EXISTS merchant_storefronts_merchant_idx
  ON merchant_storefronts(merchant_id, created_at);

CREATE TABLE IF NOT EXISTS media_asset_storefronts (
  media_asset_id integer NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  storefront_id uuid NOT NULL REFERENCES merchant_storefronts(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'library',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by_clerk_user_id text NOT NULL,
  PRIMARY KEY (media_asset_id, storefront_id)
);
CREATE INDEX IF NOT EXISTS media_asset_storefront_store_idx
  ON media_asset_storefronts(storefront_id, assigned_at);

-- Backfill the existing merchant-level storefront as one merchant-owned storefront.
INSERT INTO merchant_storefronts
  (merchant_id, name, slug, public_key, description, theme, sections, published, created_by_clerk_user_id)
SELECT
  id,
  store_name,
  lower(regexp_replace(trim(store_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(public_store_key, 1, 8),
  public_store_key,
  store_description,
  storefront_theme,
  storefront_sections,
  storefront_published,
  coalesce(clerk_user_id, 'system-migration')
FROM merchants
WHERE public_store_key IS NOT NULL
ON CONFLICT (public_key) DO NOTHING;

-- Existing public assets belong to the merchant's default storefront.
INSERT INTO media_asset_storefronts (media_asset_id, storefront_id, role, assigned_by_clerk_user_id)
SELECT
  m.id,
  s.id,
  'library',
  m.uploaded_by_clerk_user_id
FROM media_assets m
JOIN merchant_storefronts s ON s.merchant_id = m.merchant_id
WHERE m.visibility = 'public'
ON CONFLICT DO NOTHING;
