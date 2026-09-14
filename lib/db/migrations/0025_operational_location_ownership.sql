-- Migration 0025: Store ownership transfer history
CREATE TABLE lunavo.store_ownership_transfers (
  id VARCHAR(40) PRIMARY KEY,
  store_id VARCHAR(40) NOT NULL,
  old_owner_id VARCHAR(40) NOT NULL,
  new_owner_id VARCHAR(40) NOT NULL,
  reason TEXT,
  trigger_type VARCHAR(100),
  transaction_reference VARCHAR(255),
  settlement_reference VARCHAR(255),
  transfer_status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  FOREIGN KEY (store_id) REFERENCES lunavo.stores(id) ON DELETE CASCADE
);

CREATE INDEX idx_store_ownership_transfers_store_id ON lunavo.store_ownership_transfers(store_id);
