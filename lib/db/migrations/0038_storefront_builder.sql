-- Migration 0038: Storefront page builder
CREATE TABLE lunavo.storefront_pages (
  id VARCHAR(40) PRIMARY KEY,
  store_id VARCHAR(40) NOT NULL,
  page_type VARCHAR(50),
  title VARCHAR(255),
  slug VARCHAR(100),
  sections JSONB,
  status VARCHAR(50) DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  published_version INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (store_id) REFERENCES lunavo.stores(id) ON DELETE CASCADE,
  UNIQUE(store_id, slug)
);

CREATE INDEX idx_storefront_pages_store_id ON lunavo.storefront_pages(store_id);
