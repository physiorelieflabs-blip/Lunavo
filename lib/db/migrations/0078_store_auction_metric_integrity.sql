-- 0078: unsupported store-auction metrics must be nullable rather than
-- represented as fabricated zeroes or arbitrary valuation multiples.
ALTER TABLE store_auction_metric_snapshots
  ALTER COLUMN revenue_minor DROP NOT NULL,
  ALTER COLUMN verified_profit_minor DROP NOT NULL,
  ALTER COLUMN aov_minor DROP NOT NULL,
  ALTER COLUMN ad_spend_minor DROP NOT NULL,
  ALTER COLUMN ad_revenue_minor DROP NOT NULL,
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

CREATE OR REPLACE FUNCTION lunavo_sanitize_store_auction_metrics()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  merchant_currency text;
BEGIN
  -- These fields have never had an authoritative evidence source in the
  -- current snapshot producer and therefore must remain unavailable.
  NEW.growth_percent := NULL;
  NEW.traffic_count := NULL;
  NEW.conversion_percent := NULL;
  NEW.expenses_minor := NULL;
  NEW.valuation_indicator_minor := NULL;

  -- Monetary metrics are only verified when the snapshot currency matches the
  -- seller workspace currency. This prevents a multi-currency order sum from
  -- being relabelled as the auction currency and prevents USD-only verified
  -- profit from being presented as another currency.
  SELECT m.currency INTO merchant_currency
  FROM store_auction_listings a
  JOIN merchants m ON m.id = a.seller_merchant_id
  WHERE a.id = NEW.auction_id;

  IF merchant_currency IS NULL OR upper(merchant_currency) <> upper(NEW.currency) THEN
    NEW.revenue_minor := NULL;
    NEW.verified_profit_minor := NULL;
    NEW.aov_minor := NULL;
    NEW.ad_spend_minor := NULL;
    NEW.ad_revenue_minor := NULL;
  END IF;

  -- A verified-profit record is USD-denominated in the current control plane.
  IF upper(NEW.currency) <> 'USD' THEN
    NEW.verified_profit_minor := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lunavo_sanitize_store_auction_metrics_trigger
  ON store_auction_metric_snapshots;
CREATE TRIGGER lunavo_sanitize_store_auction_metrics_trigger
BEFORE INSERT OR UPDATE ON store_auction_metric_snapshots
FOR EACH ROW
EXECUTE FUNCTION lunavo_sanitize_store_auction_metrics();
