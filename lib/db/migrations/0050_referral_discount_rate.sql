-- Migration 0050: Referral discount configuration
CREATE TABLE lunavo.referral_config (
  id VARCHAR(40) PRIMARY KEY,
  discount_percent DECIMAL(5, 2) DEFAULT 30,
  valid_for_months INT DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO lunavo.referral_config (discount_percent, valid_for_months) VALUES (30, 1);
