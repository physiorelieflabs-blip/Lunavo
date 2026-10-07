-- 0115: supplier fallback quality constraints
ALTER TABLE supplier_product_alternatives
  ADD COLUMN IF NOT EXISTS min_supplier_quantity integer NOT NULL DEFAULT 0 CHECK (min_supplier_quantity >= 0),
  ADD COLUMN IF NOT EXISTS max_shipping_days integer NOT NULL DEFAULT 30 CHECK (max_shipping_days > 0 AND max_shipping_days <= 365);