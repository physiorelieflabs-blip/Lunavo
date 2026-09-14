-- Migration 0037: Flutterwave specific webhook handling (already in payment_webhook_events)
CREATE TABLE IF NOT EXISTS lunavo.flutterwave_transactions (
  id VARCHAR(40) PRIMARY KEY,
  flutterwave_id VARCHAR(255) NOT NULL UNIQUE,
  transaction_id VARCHAR(40),
  status VARCHAR(50),
  amount DECIMAL(14, 2),
  currency VARCHAR(3),
  customer_id VARCHAR(255),
  customer_email VARCHAR(255),
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (transaction_id) REFERENCES lunavo.transactions(id) ON DELETE SET NULL
);
