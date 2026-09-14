-- Migration 0011: Inventory management
CREATE TABLE lunavo.inventory_movements (
  id VARCHAR(40) PRIMARY KEY,
  product_id VARCHAR(40) NOT NULL,
  order_id VARCHAR(40),
  type VARCHAR(50) NOT NULL,
  quantity INT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (product_id) REFERENCES lunavo.products(id) ON DELETE CASCADE
);

CREATE INDEX idx_inventory_movements_product_id ON lunavo.inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_order_id ON lunavo.inventory_movements(order_id);
