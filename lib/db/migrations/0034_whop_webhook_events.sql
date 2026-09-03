CREATE TABLE IF NOT EXISTS whop_webhook_events (
  id serial PRIMARY KEY,
  webhook_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  provider_payment_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'received',
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS whop_webhook_events_payment_idx
  ON whop_webhook_events (provider_payment_id);