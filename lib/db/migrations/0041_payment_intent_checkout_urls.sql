-- Migration 0041: Payment intents
CREATE TABLE lunavo.payment_intents (
  id VARCHAR(40) PRIMARY KEY,
  checkout_session_id VARCHAR(40),
  merchant_id VARCHAR(40) NOT NULL,
  amount DECIMAL(14, 2) NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  status VARCHAR(50) DEFAULT 'created',
  client_secret VARCHAR(255),
  checkout_url VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE
);

CREATE INDEX idx_payment_intents_merchant_id ON lunavo.payment_intents(merchant_id);
CREATE INDEX idx_payment_intents_status ON lunavo.payment_intents(status);
