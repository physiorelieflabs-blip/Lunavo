-- Migration 0095: align growth product references with the UUID supplier catalog.
ALTER TABLE product_advertising_campaigns ALTER COLUMN product_id TYPE text USING product_id::text;
ALTER TABLE marketplace_discovery_events ALTER COLUMN product_id TYPE text USING product_id::text;
