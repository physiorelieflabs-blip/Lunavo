-- Migration 0032: Public checkout sessions
CREATE TABLE lunavo.checkout_sessions (
  id VARCHAR(40) PRIMARY KEY,
  store_id VARCHAR(40) NOT NULL,
  cart_id VARCHAR(40),
  status VARCHAR(50) DEFAULT 'active',
  customer_email VARCHAR(255),
  customer_data JSONB,
  line_items JSONB NOT NULL,
  total_amount DECIMAL(14, 2),
  currency_code VARCHAR(3),
  payment_intent_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  FOREIGN KEY (store_id) REFERENCES lunavo.stores(id) ON DELETE CASCADE
);

CREATE INDEX idx_checkout_sessions_store_id ON lunavo.checkout_sessions(store_id);
CREATE INDEX idx_checkout_sessions_payment_intent_id ON lunavo.checkout_sessions(payment_intent_id);
