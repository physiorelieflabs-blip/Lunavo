-- Migration 0023: Event outbox for notifications
CREATE TABLE lunavo.event_outbox (
  id VARCHAR(40) PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(40),
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_event_outbox_processed ON lunavo.event_outbox(processed);
CREATE INDEX idx_event_outbox_created_at ON lunavo.event_outbox(created_at);
