-- Migration 0027: Store profile enhancements
ALTER TABLE lunavo.stores ADD COLUMN IF NOT EXISTS brand_colors JSONB;
ALTER TABLE lunavo.stores ADD COLUMN IF NOT EXISTS typography JSONB;
ALTER TABLE lunavo.stores ADD COLUMN IF NOT EXISTS navigation JSONB;
ALTER TABLE lunavo.stores ADD COLUMN IF NOT EXISTS checkout_settings JSONB;
ALTER TABLE lunavo.stores ADD COLUMN IF NOT EXISTS shipping_settings JSONB;
ALTER TABLE lunavo.stores ADD COLUMN IF NOT EXISTS tax_settings JSONB;
