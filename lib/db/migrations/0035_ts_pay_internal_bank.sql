-- Migration 0035: TS Pay merchant ledger
CREATE TABLE lunavo.merchant_ledger (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL,
  transaction_id VARCHAR(40) NOT NULL,
  debit DECIMAL(14, 2),
  credit DECIMAL(14, 2),
  balance_after DECIMAL(14, 2),
  entry_type VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES lunavo.transactions(id) ON DELETE CASCADE
);

CREATE INDEX idx_merchant_ledger_merchant_id ON lunavo.merchant_ledger(merchant_id);
CREATE INDEX idx_merchant_ledger_transaction_id ON lunavo.merchant_ledger(transaction_id);
