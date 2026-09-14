-- Migration 0054: Ad creative management
CREATE TABLE lunavo.ad_creatives (
  id VARCHAR(40) PRIMARY KEY,
  merchant_id VARCHAR(40) NOT NULL,
  campaign_id VARCHAR(40),
  title VARCHAR(255),
  body TEXT,
  image_url VARCHAR(500),
  video_url VARCHAR(500),
  cta_button_text VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE
);
