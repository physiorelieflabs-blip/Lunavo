-- Migration 0016: Customer segmentation
CREATE TABLE lunavo.customer_segments (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL,
  name VARCHAR(255) NOT NULL,
  criteria JSONB,
  customer_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE
);
