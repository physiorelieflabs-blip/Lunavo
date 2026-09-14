-- Migration 0006: Cart and checkout support
CREATE TABLE lunavo.carts (
  id VARCHAR(40) PRIMARY KEY,
  store_id VARCHAR(40) NOT NULL,
  customer_email VARCHAR(255),
  items JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  FOREIGN KEY (store_id) REFERENCES lunavo.stores(id) ON DELETE CASCADE
);

CREATE INDEX idx_carts_store_id ON lunavo.carts(store_id);
CREATE INDEX idx_carts_customer_email ON lunavo.carts(customer_email);
