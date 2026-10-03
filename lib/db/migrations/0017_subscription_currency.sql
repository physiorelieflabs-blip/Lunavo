-- Migration 0017: Subscription management
CREATE TABLE lunavo.subscriptions (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL UNIQUE,
  status VARCHAR(50) DEFAULT 'pending',
  plan VARCHAR(50) DEFAULT 'core',
  currency_code VARCHAR(3) NOT NULL,
  monthly_amount DECIMAL(14, 2) NOT NULL,
  applied_referral_discount DECIMAL(14, 2) DEFAULT 0,
  billing_start_at TIMESTAMPTZ,
  next_billing_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  last_payment_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  failure_reason TEXT,
  canceled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE
);

CREATE INDEX idx_subscriptions_merchant_id ON lunavo.subscriptions(merchant_id);
CREATE INDEX idx_subscriptions_status ON lunavo.subscriptions(status);
