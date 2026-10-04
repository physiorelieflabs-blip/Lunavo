-- 0111_customer_alerts.sql
ALTER TABLE customer_price_watches ADD COLUMN IF NOT EXISTS last_notified_at timestamptz;
ALTER TABLE customer_saved_searches ADD COLUMN IF NOT EXISTS last_notified_at timestamptz;
CREATE TABLE IF NOT EXISTS customer_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
 visitor_key text NOT NULL,
 notification_type text NOT NULL,
 entity_type text NOT NULL,
 entity_id text NOT NULL,
 title text NOT NULL,
 body text NOT NULL,
 deep_link text,
 read_at timestamptz,
 dedupe_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_notifications_dedupe_unique ON customer_notifications(merchant_id,dedupe_key);
CREATE INDEX IF NOT EXISTS customer_notifications_lookup_idx ON customer_notifications(merchant_id,visitor_key,created_at DESC);