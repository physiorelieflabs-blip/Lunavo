-- Migration 0057: Provider credential management
CREATE TABLE lunavo.provider_credentials (
  id VARCHAR(40) PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  credential_type VARCHAR(50) NOT NULL,
  encrypted_value TEXT NOT NULL,
  encryption_key_version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  validated_at TIMESTAMPTZ,
  last_validation_status VARCHAR(50),
  last_validation_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, credential_type)
);

CREATE INDEX idx_provider_credentials_provider ON lunavo.provider_credentials(provider);

-- Audit logs
CREATE TABLE lunavo.audit_logs (
  id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40),
  merchant_id VARCHAR(40),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(40),
  changes JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  status VARCHAR(50) DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON lunavo.audit_logs(user_id);
CREATE INDEX idx_audit_logs_merchant_id ON lunavo.audit_logs(merchant_id);
CREATE INDEX idx_audit_logs_action ON lunavo.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON lunavo.audit_logs(created_at);

-- Sessions
CREATE TABLE lunavo.sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  session_token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES lunavo.users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user_id ON lunavo.sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON lunavo.sessions(expires_at);

-- Orders
CREATE TABLE lunavo.orders (
  id VARCHAR(40) PRIMARY KEY,
  order_number VARCHAR(50) NOT NULL,
  store_id VARCHAR(40) NOT NULL,
  merchant_id VARCHAR(40) NOT NULL,
  customer_id VARCHAR(40),
  status VARCHAR(50) DEFAULT 'pending_payment',
  currency_code VARCHAR(3) NOT NULL,
  gross_amount DECIMAL(14, 2) NOT NULL,
  tax_amount DECIMAL(14, 2) DEFAULT 0,
  shipping_amount DECIMAL(14, 2) DEFAULT 0,
  discount_amount DECIMAL(14, 2) DEFAULT 0,
  net_amount DECIMAL(14, 2) NOT NULL,
  payment_id VARCHAR(40),
  refunded_amount DECIMAL(14, 2) DEFAULT 0,
  customer_email VARCHAR(255),
  shipping_address JSONB,
  billing_address JSONB,
  items JSONB,
  notes TEXT,
  paid_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (store_id) REFERENCES lunavo.stores(id) ON DELETE CASCADE,
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES lunavo.customers(id) ON DELETE SET NULL,
  UNIQUE(store_id, order_number)
);

CREATE INDEX idx_orders_store_id ON lunavo.orders(store_id);
CREATE INDEX idx_orders_merchant_id ON lunavo.orders(merchant_id);
CREATE INDEX idx_orders_customer_id ON lunavo.orders(customer_id);
CREATE INDEX idx_orders_status ON lunavo.orders(status);
CREATE INDEX idx_orders_payment_id ON lunavo.orders(payment_id);
