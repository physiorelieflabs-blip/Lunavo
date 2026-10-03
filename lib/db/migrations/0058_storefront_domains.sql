CREATE TABLE IF NOT EXISTS merchant_storefront_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  storefront_id UUID REFERENCES merchant_storefronts(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  domain_type TEXT NOT NULL DEFAULT 'custom',
  verification_token TEXT NOT NULL,
  verification_method TEXT NOT NULL DEFAULT 'dns_txt',
  status TEXT NOT NULL DEFAULT 'pending',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_storefront_domains_type_check CHECK (domain_type IN ('subdomain','custom')),
  CONSTRAINT merchant_storefront_domains_status_check CHECK (status IN ('pending','verified','disabled')),
  CONSTRAINT merchant_storefront_domains_method_check CHECK (verification_method IN ('dns_txt'))
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_storefront_domains_hostname_unique
  ON merchant_storefront_domains (lower(hostname));
CREATE INDEX IF NOT EXISTS merchant_storefront_domains_merchant_idx
  ON merchant_storefront_domains (merchant_id, status);
CREATE INDEX IF NOT EXISTS merchant_storefront_domains_storefront_idx
  ON merchant_storefront_domains (storefront_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS merchant_storefront_domains_one_primary_per_storefront
  ON merchant_storefront_domains (storefront_id)
  WHERE is_primary = TRUE AND status = 'verified';
