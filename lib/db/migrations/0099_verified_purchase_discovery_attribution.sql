ALTER TABLE marketplace_discovery_events
  ADD COLUMN IF NOT EXISTS order_id integer REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS marketplace_events_order_idx
  ON marketplace_discovery_events (order_id);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_events_verified_purchase_order_uidx
  ON marketplace_discovery_events (order_id)
  WHERE event_type = 'purchase' AND order_id IS NOT NULL;

-- Historical rows are intentionally not promoted to verified purchases because
-- public clients were previously able to submit purchase events.
DELETE FROM marketplace_discovery_events
WHERE event_type = 'purchase' AND order_id IS NULL;
