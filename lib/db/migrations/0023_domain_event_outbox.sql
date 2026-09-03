CREATE TABLE IF NOT EXISTS domain_events (
  id uuid PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  event_type text NOT NULL,
  payload_version integer NOT NULL DEFAULT 1,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  actor_type text NOT NULL,
  actor_id text,
  source text NOT NULL,
  correlation_id uuid,
  causation_id uuid,
  idempotency_key text NOT NULL,
  before jsonb,
  after jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT domain_events_merchant_idempotency_unique UNIQUE (merchant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS domain_events_dispatch_idx ON domain_events(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS domain_events_merchant_occurred_idx ON domain_events(merchant_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS domain_event_consumptions (
  id serial PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES domain_events(id),
  consumer text NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT domain_event_consumptions_event_consumer_unique UNIQUE (event_id, consumer)
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  recipient_type text NOT NULL DEFAULT 'merchant',
  recipient_id text,
  actor_type text,
  actor_id text,
  event_id uuid REFERENCES domain_events(id),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  deep_link text,
  action_label text,
  severity text NOT NULL DEFAULT 'info',
  dedupe_key text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_merchant_dedupe_unique UNIQUE (merchant_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS notifications_merchant_created_idx ON notifications(merchant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS automation_event_hooks (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  event_id uuid NOT NULL REFERENCES domain_events(id),
  status text NOT NULL DEFAULT 'observed',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_event_hooks_event_unique UNIQUE (event_id)
);