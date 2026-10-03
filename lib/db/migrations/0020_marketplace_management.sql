-- Migration 0020: Marketplace listings
CREATE TABLE lunavo.marketplace_listings (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL,
  product_id VARCHAR(40) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending_review',
  listing_fee DECIMAL(14, 2) NOT NULL,
  monthly_fee DECIMAL(14, 2) DEFAULT 5,
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE,
  UNIQUE(product_id)
);

CREATE INDEX idx_marketplace_listings_merchant_id ON lunavo.marketplace_listings(merchant_id);
CREATE INDEX idx_marketplace_listings_status ON lunavo.marketplace_listings(status);
