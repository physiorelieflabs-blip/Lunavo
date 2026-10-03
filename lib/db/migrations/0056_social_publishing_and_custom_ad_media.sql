-- Migration 0056: Social publishing queue
CREATE TABLE lunavo.social_posts (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL,
  social_account_id VARCHAR(40),
  content TEXT NOT NULL,
  media_url VARCHAR(500),
  platform VARCHAR(50),
  status VARCHAR(50) DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  external_post_id VARCHAR(255),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE
);

CREATE INDEX idx_social_posts_merchant_id ON lunavo.social_posts(merchant_id);
CREATE INDEX idx_social_posts_status ON lunavo.social_posts(status);
