-- Migration 0052: Marketplace advertising links
ALTER TABLE lunavo.advertising_campaigns ADD COLUMN IF NOT EXISTS marketplace_listing_id VARCHAR(40);
ALTER TABLE lunavo.advertising_campaigns ADD COLUMN IF NOT EXISTS payment_link_id VARCHAR(40);
