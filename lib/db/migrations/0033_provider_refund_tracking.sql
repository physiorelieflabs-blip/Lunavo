-- Migration 0033: Refunds
CREATE TABLE lunavo.refunds (
  id VARCHAR(40) PRIMARY KEY,
  transaction_id VARCHAR(40) NOT NULL,
  order_id VARCHAR(40),
  amount DECIMAL(14, 2) NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  status VARCHAR(50) DEFAULT 'requested',
  reason TEXT,
  provider_refund_id VARCHAR(255),
  provider_status VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  FOREIGN KEY (transaction_id) REFERENCES lunavo.transactions(id) ON DELETE CASCADE
);

CREATE INDEX idx_refunds_transaction_id ON lunavo.refunds(transaction_id);
CREATE INDEX idx_refunds_status ON lunavo.refunds(status);
