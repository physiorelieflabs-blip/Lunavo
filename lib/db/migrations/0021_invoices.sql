-- Migration 0021: Invoice management
CREATE TABLE lunavo.invoices (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  amount DECIMAL(14, 2) NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE
);

CREATE INDEX idx_invoices_merchant_id ON lunavo.invoices(merchant_id);
