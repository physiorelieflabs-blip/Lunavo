-- Migration 0055: Social media connections
CREATE TABLE lunavo.social_accounts (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  account_id VARCHAR(255),
  account_username VARCHAR(255),
  access_token_encrypted VARCHAR(500),
  refresh_token_encrypted VARCHAR(500),
  expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE
);

CREATE INDEX idx_social_accounts_merchant_id ON lunavo.social_accounts(merchant_id);
