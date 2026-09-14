-- Migration 0024: Staff and roles
CREATE TABLE lunavo.staff_members (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL,
  user_id VARCHAR(40),
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE
);

CREATE INDEX idx_staff_members_merchant_id ON lunavo.staff_members(merchant_id);
