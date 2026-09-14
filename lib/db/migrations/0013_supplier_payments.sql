-- Migration 0013: Supplier payment tracking
CREATE TABLE lunavo.supplier_payments (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL,
  supplier_id VARCHAR(40),
  amount DECIMAL(14, 2) NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
