-- Migration 0045: Settlement snapshots
CREATE TABLE lunavo.settlement_snapshots (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  gross_amount DECIMAL(14, 2),
  fees_amount DECIMAL(14, 2),
  net_amount DECIMAL(14, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE
);
