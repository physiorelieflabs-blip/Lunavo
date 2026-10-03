-- Migration 0010: TS Pay ledger and transactions
CREATE TABLE lunavo.transactions (
  id VARCHAR(40) PRIMARY KEY,
  idempotency_key VARCHAR(100) UNIQUE,
  merchant_id VARCHAR(40) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  currency_code VARCHAR(3) NOT NULL,
  gross_amount DECIMAL(14, 2) NOT NULL,
  provider_fee DECIMAL(14, 2) DEFAULT 0,
  lunavo_fee DECIMAL(14, 2) DEFAULT 0,
  net_amount DECIMAL(14, 2) NOT NULL,
  order_id VARCHAR(40),
  provider_reference VARCHAR(255),
  provider_status VARCHAR(50),
  source_id VARCHAR(40),
  description TEXT,
  metadata JSONB,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE,
  UNIQUE(idempotency_key)
);

CREATE INDEX idx_transactions_merchant_id ON lunavo.transactions(merchant_id);
CREATE INDEX idx_transactions_type ON lunavo.transactions(type);
CREATE INDEX idx_transactions_status ON lunavo.transactions(status);
CREATE INDEX idx_transactions_provider_reference ON lunavo.transactions(provider_reference);
