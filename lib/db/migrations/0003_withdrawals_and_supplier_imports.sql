-- Migration 0003: Withdrawals and supplier tracking
CREATE TABLE lunavo.withdrawal_requests (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL,
  status VARCHAR(50) DEFAULT 'requested',
  currency_code VARCHAR(3) NOT NULL,
  amount DECIMAL(14, 2) NOT NULL,
  bank_name VARCHAR(255),
  account_number VARCHAR(255),
  account_holder_name VARCHAR(255),
  recipient_code VARCHAR(255),
  provider_transfer_id VARCHAR(255),
  provider_status VARCHAR(50),
  approval_comment TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by VARCHAR(40),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE
);

CREATE INDEX idx_withdrawals_merchant_id ON lunavo.withdrawal_requests(merchant_id);
CREATE INDEX idx_withdrawals_status ON lunavo.withdrawal_requests(status);
