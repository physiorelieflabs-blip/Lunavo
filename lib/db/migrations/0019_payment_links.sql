-- Migration 0019: Payment links
CREATE TABLE lunavo.payment_links (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL,
  store_id VARCHAR(40),
  name VARCHAR(255),
  description TEXT,
  amount DECIMAL(14, 2),
  currency_code VARCHAR(3) NOT NULL,
  url_slug VARCHAR(100) UNIQUE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE
);
