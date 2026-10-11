-- Locally persisted, source-labelled official FX observations.
-- Values are units of the currency per USD; each currency has an independent source date.
CREATE TABLE IF NOT EXISTS market_fx_rate_snapshots (
  id bigserial PRIMARY KEY,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source_summary text NOT NULL,
  rates_per_usd jsonb NOT NULL,
  as_of_by_currency jsonb NOT NULL,
  source_by_currency jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS market_fx_rate_snapshots_fetched_at_idx
  ON market_fx_rate_snapshots(fetched_at DESC, id DESC);
