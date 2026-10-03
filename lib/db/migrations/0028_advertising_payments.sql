-- Migration 0028: Advertising campaigns and tracking
CREATE TABLE lunavo.advertising_campaigns (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL,
  store_id VARCHAR(40),
  product_id VARCHAR(40),
  name VARCHAR(255) NOT NULL,
  goal VARCHAR(100),
  audience JSONB,
  creative TEXT,
  message TEXT,
  cta VARCHAR(100),
  channel VARCHAR(50),
  status VARCHAR(50) DEFAULT 'draft',
  budget DECIMAL(14, 2),
  daily_volume INT,
  approval_status VARCHAR(50),
  execution_state VARCHAR(50),
  performance JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE
);

CREATE INDEX idx_advertising_campaigns_merchant_id ON lunavo.advertising_campaigns(merchant_id);
