ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_shipping_threshold NUMERIC(12, 2);

ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_tax_rate_check;
ALTER TABLE merchants ADD CONSTRAINT merchants_tax_rate_check
  CHECK (tax_rate >= 0 AND tax_rate <= 100);

ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_shipping_fee_check;
ALTER TABLE merchants ADD CONSTRAINT merchants_shipping_fee_check
  CHECK (shipping_fee >= 0);

ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_free_shipping_threshold_check;
ALTER TABLE merchants ADD CONSTRAINT merchants_free_shipping_threshold_check
  CHECK (free_shipping_threshold IS NULL OR free_shipping_threshold >= 0);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;