-- Migration 0005: Supplier and dropshipping support
CREATE TABLE lunavo.suppliers (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40),
  name VARCHAR(255) NOT NULL,
  website VARCHAR(500),
  contact_email VARCHAR(255),
  verified BOOLEAN DEFAULT FALSE,
  rating DECIMAL(3, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
