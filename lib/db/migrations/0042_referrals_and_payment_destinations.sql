-- Migration 0042: Referral system
CREATE TABLE lunavo.referral_rewards (
  id VARCHAR(40) PRIMARY KEY,
  referrer_merchant_id VARCHAR(40) NOT NULL,
  referred_merchant_id VARCHAR(40) NOT NULL,
  referral_code VARCHAR(20) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  qualifying_transaction_id VARCHAR(40),
  reward_amount DECIMAL(14, 2),
  reward_type VARCHAR(50) DEFAULT 'discount_percent',
  reward_value DECIMAL(5, 2) DEFAULT 30,
  applied_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (referrer_merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE,
  FOREIGN KEY (referred_merchant_id) REFERENCES lunavo.merchants(id) ON DELETE CASCADE,
  UNIQUE(referrer_merchant_id, referred_merchant_id)
);

CREATE INDEX idx_referral_rewards_referrer ON lunavo.referral_rewards(referrer_merchant_id);
CREATE INDEX idx_referral_rewards_referred ON lunavo.referral_rewards(referred_merchant_id);
