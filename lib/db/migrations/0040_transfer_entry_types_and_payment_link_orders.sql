-- Migration 0040: Payment link orders
CREATE TABLE lunavo.payment_link_orders (
  id VARCHAR(40) PRIMARY KEY,
  payment_link_id VARCHAR(40) NOT NULL,
  transaction_id VARCHAR(40),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (payment_link_id) REFERENCES lunavo.payment_links(id) ON DELETE CASCADE
);
