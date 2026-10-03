-- Migration 0053: Dropshipping automation
CREATE TABLE lunavo.dropship_products (
  id VARCHAR(40) PRIMARY KEY,
  product_id VARCHAR(40) NOT NULL,
  supplier_id VARCHAR(40),
  supplier_sku VARCHAR(100),
  auto_fulfill BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (product_id) REFERENCES lunavo.products(id) ON DELETE CASCADE
);
