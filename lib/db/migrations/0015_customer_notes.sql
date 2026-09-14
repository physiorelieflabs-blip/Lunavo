-- Migration 0015: Customer management
CREATE TABLE lunavo.customers (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(2),
  lifetime_value DECIMAL(14, 2) DEFAULT 0,
  order_count INT DEFAULT 0,
  last_order_at TIMESTAMPTZ,
  marketing_consent BOOLEAN DEFAULT FALSE,
  tags TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE,
  UNIQUE(merchant_id, email)
);

CREATE INDEX idx_customers_merchant_id ON lunavo.customers(merchant_id);
CREATE INDEX idx_customers_email ON lunavo.customers(email);
