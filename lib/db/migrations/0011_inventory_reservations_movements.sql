-- Transactional inventory reservations and immutable stock movement history.
CREATE TABLE IF NOT EXISTS inventory_reservations (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  supplier_product_id INTEGER NOT NULL REFERENCES supplier_products(id),
  order_id INTEGER NOT NULL REFERENCES orders(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','consumed','released','expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_reservations_active_order_product_unique
  ON inventory_reservations(order_id, supplier_product_id)
  WHERE status = 'reserved';
CREATE INDEX IF NOT EXISTS inventory_reservations_merchant_product_idx
  ON inventory_reservations(merchant_id, supplier_product_id, status);
CREATE INDEX IF NOT EXISTS inventory_reservations_expires_idx
  ON inventory_reservations(supplier_product_id, expires_at)
  WHERE status = 'reserved';

CREATE TABLE IF NOT EXISTS inventory_movements (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  supplier_product_id INTEGER NOT NULL REFERENCES supplier_products(id),
  order_id INTEGER REFERENCES orders(id),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  reason TEXT NOT NULL,
  reference_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_movements_merchant_product_idx
  ON inventory_movements(merchant_id, supplier_product_id, created_at);