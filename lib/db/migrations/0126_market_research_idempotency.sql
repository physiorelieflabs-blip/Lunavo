-- Idempotent public market-research captures. Repeating the same client request must
-- return the stored observation rather than silently creating duplicate time-series points.
ALTER TABLE dropship_market_research
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

DO $$
BEGIN
  ALTER TABLE dropship_market_research
    ADD CONSTRAINT dropship_market_research_idempotency_key_length
    CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 8 AND 120);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE dropship_market_research
    ADD CONSTRAINT dropship_market_research_fingerprint_format
    CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[0-9a-f]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS dropship_market_research_idempotency_unique
  ON dropship_market_research(merchant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
