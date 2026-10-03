-- Migration 0034: Provider webhook events
CREATE TABLE lunavo.payment_webhook_events (
  id VARCHAR(40) PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  webhook_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  provider_payment_id VARCHAR(255),
  payload JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'received',
  error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, webhook_id)
);

CREATE INDEX idx_payment_webhooks_provider ON lunavo.payment_webhook_events(provider);
CREATE INDEX idx_payment_webhooks_status ON lunavo.payment_webhook_events(status);
