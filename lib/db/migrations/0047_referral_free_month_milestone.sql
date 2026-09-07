ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS referral_free_months integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS referral_milestones (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  milestone_key text NOT NULL,
  qualifying_referral_count integer NOT NULL CHECK (qualifying_referral_count >= 0),
  free_months integer NOT NULL CHECK (free_months > 0),
  status text NOT NULL DEFAULT 'granted',
  granted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_milestones_merchant_key_unique UNIQUE (merchant_id, milestone_key)
);

CREATE INDEX IF NOT EXISTS referral_milestones_merchant_idx
  ON referral_milestones(merchant_id, created_at);