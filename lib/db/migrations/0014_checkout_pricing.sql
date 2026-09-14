-- Migration 0014: Checkout pricing calculations
ALTER TABLE lunavo.carts ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(14, 2) DEFAULT 0;
ALTER TABLE lunavo.carts ADD COLUMN IF NOT EXISTS shipping_amount DECIMAL(14, 2) DEFAULT 0;
ALTER TABLE lunavo.carts ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(14, 2) DEFAULT 0;
ALTER TABLE lunavo.carts ADD COLUMN IF NOT EXISTS net_amount DECIMAL(14, 2);
