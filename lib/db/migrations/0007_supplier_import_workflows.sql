-- Migration 0007: Supplier import workflows
CREATE TABLE lunavo.supplier_imports (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL,
  supplier_url VARCHAR(500),
  status VARCHAR(50) DEFAULT 'pending',
  extracted_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE
);
