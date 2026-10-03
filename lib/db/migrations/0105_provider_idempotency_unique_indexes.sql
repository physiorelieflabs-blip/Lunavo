-- 0105: database-enforced provider idempotency.
-- Application-level duplicate checks are not sufficient under concurrent webhook
-- delivery. Provider transaction and provider event identifiers are unique per
-- provider/method at the database boundary when present.

CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_provider_transaction_unique
  ON payment_intents(method, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_provider_event_unique
  ON payment_intents(method, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_transaction_unique
  ON payments(method, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_event_unique
  ON payments(method, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
