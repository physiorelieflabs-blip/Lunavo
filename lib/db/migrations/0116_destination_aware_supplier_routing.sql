-- 0116: destination-aware supplier routing and order geography snapshot
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_country text;

ALTER TABLE supplier_product_alternatives
  ADD COLUMN IF NOT EXISTS destination_mode text NOT NULL DEFAULT 'global'
    CHECK (destination_mode IN ('global','include','exclude')),
  ADD COLUMN IF NOT EXISTS destination_countries jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS orders_merchant_customer_country_idx
  ON orders (merchant_id, customer_country);
CREATE INDEX IF NOT EXISTS supplier_product_alternatives_destination_idx
  ON supplier_product_alternatives (merchant_id, primary_product_id, destination_mode);