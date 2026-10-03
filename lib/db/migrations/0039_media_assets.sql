-- Migration 0039: Media library
CREATE TABLE lunavo.media_assets (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size INT NOT NULL,
  url VARCHAR(500) NOT NULL,
  alt_text VARCHAR(500),
  source VARCHAR(50) DEFAULT 'upload',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE
);

CREATE INDEX idx_media_assets_merchant_id ON lunavo.media_assets(merchant_id);
