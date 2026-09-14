-- Migration 0002: Core commerce entities
CREATE TABLE lunavo.users (
  id VARCHAR(40) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(255),
  password_hash VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_secret VARCHAR(255),
  email_verified BOOLEAN DEFAULT FALSE,
  email_verification_token VARCHAR(255),
  email_verification_token_expires_at TIMESTAMPTZ,
  password_reset_token VARCHAR(255),
  password_reset_token_expires_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  suspicious_login_detected_at TIMESTAMPTZ,
  account_locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON lunavo.users(email);
CREATE INDEX idx_users_role ON lunavo.users(role);

CREATE TABLE lunavo.merchants (
  id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL UNIQUE,
  merchant_key VARCHAR(50) NOT NULL UNIQUE,
  company_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  status VARCHAR(50) DEFAULT 'active',
  subscription_id VARCHAR(40),
  subscription_expires_at TIMESTAMPTZ,
  current_balance DECIMAL(20, 2) DEFAULT 0,
  available_balance DECIMAL(20, 2) DEFAULT 0,
  held_balance DECIMAL(20, 2) DEFAULT 0,
  currency_code VARCHAR(3) DEFAULT 'USD',
  kyc_verified BOOLEAN DEFAULT FALSE,
  business_registration_number VARCHAR(100),
  tax_id VARCHAR(100),
  store_website VARCHAR(255),
  referral_code VARCHAR(20) UNIQUE,
  referral_discount_percent INT DEFAULT 0,
  referral_discount_expires_at TIMESTAMPTZ,
  suspended_reason TEXT,
  suspended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES lunavo.users(id) ON DELETE CASCADE
);

CREATE INDEX idx_merchants_user_id ON lunavo.merchants(user_id);
CREATE INDEX idx_merchants_merchant_key ON lunavo.merchants(merchant_key);
CREATE INDEX idx_merchants_status ON lunavo.merchants(status);

CREATE TABLE lunavo.stores (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL,
  store_key VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  logo_url VARCHAR(500),
  favicon_url VARCHAR(500),
  primary_domain VARCHAR(255),
  status VARCHAR(50) DEFAULT 'draft',
  currency_code VARCHAR(3) DEFAULT 'USD',
  tax_rate_percent DECIMAL(5, 2) DEFAULT 0,
  settings JSONB,
  published_at TIMESTAMPTZ,
  published_version INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE,
  UNIQUE(merchant_id, slug)
);

CREATE INDEX idx_stores_merchant_id ON lunavo.stores(merchant_id);
CREATE INDEX idx_stores_status ON lunavo.stores(status);
CREATE INDEX idx_stores_primary_domain ON lunavo.stores(primary_domain);

CREATE TABLE lunavo.products (
  id VARCHAR(40) PRIMARY KEY,
  store_id VARCHAR(40) NOT NULL,
  merchant_id VARCHAR(40) NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  currency_code VARCHAR(3) NOT NULL,
  base_price DECIMAL(14, 2) NOT NULL,
  sale_price DECIMAL(14, 2),
  cost DECIMAL(14, 2),
  sku VARCHAR(100),
  type VARCHAR(50) DEFAULT 'physical',
  weight DECIMAL(10, 3),
  dimensions JSONB,
  images JSONB,
  stock INT DEFAULT 0,
  reserved INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (store_id) REFERENCES lunavo.stores(id) ON DELETE CASCADE,
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE,
  UNIQUE(store_id, slug)
);

CREATE INDEX idx_products_store_id ON lunavo.products(store_id);
CREATE INDEX idx_products_merchant_id ON lunavo.products(merchant_id);
CREATE INDEX idx_products_status ON lunavo.products(status);
