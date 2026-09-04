CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id serial PRIMARY KEY,
  provider text NOT NULL,
  webhook_id text NOT NULL,
  event_type text NOT NULL,
  provider_payment_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'received',
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, webhook_id)
);

CREATE INDEX IF NOT EXISTS payment_webhook_events_payment_idx
  ON payment_webhook_events (provider, provider_payment_id);