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
