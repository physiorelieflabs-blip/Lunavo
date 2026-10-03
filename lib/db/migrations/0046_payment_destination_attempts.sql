-- Migration 0046: Payout attempt tracking
CREATE TABLE lunavo.payout_attempts (
  id VARCHAR(40) PRIMARY KEY,
  withdrawal_request_id VARCHAR(40) NOT NULL,
  attempt_number INT DEFAULT 1,
  status VARCHAR(50) DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (withdrawal_request_id) REFERENCES lunavo.withdrawal_requests(id) ON DELETE CASCADE
);
