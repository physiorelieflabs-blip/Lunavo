-- 0078: unsupported store-auction metrics must be nullable rather than
-- represented as fabricated zeroes or arbitrary valuation multiples.
ALTER TABLE store_auction_metric_snapshots
  ALTER COLUMN growth_percent DROP NOT NULL,
  ALTER COLUMN traffic_count DROP NOT NULL,
  ALTER COLUMN conversion_percent DROP NOT NULL,
  ALTER COLUMN expenses_minor DROP NOT NULL,
  ALTER COLUMN valuation_indicator_minor DROP NOT NULL;

-- Historical snapshots created before this migration contained placeholder
-- values. Remove those placeholders so the public auction API cannot present
-- them as verified facts. Legitimate values can be written by future evidence-backed
-- snapshot jobs.
UPDATE store_auction_metric_snapshots
SET growth_percent = NULL,
    traffic_count = NULL,
    conversion_percent = NULL,
    expenses_minor = NULL,
    valuation_indicator_minor = NULL;

-- The current snapshot producer still supplies legacy placeholder fields. Keep
-- the database as the final integrity boundary so future callers cannot
-- accidentally reintroduce them as verified metrics.
CREATE OR REPLACE FUNCTION lunavo_sanitize_store_auction_metrics()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.growth_percent := NULL;
  NEW.traffic_count := NULL;
  NEW.conversion_percent := NULL;
  NEW.expenses_minor := NULL;
  NEW.valuation_indicator_minor := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lunavo_sanitize_store_auction_metrics_trigger
  ON store_auction_metric_snapshots;
CREATE TRIGGER lunavo_sanitize_store_auction_metrics_trigger
BEFORE INSERT OR UPDATE ON store_auction_metric_snapshots
FOR EACH ROW
EXECUTE FUNCTION lunavo_sanitize_store_auction_metrics();
