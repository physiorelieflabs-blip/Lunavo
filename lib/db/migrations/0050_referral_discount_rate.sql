-- Referral discounts are entitlements expressed as a rate, so they remain valid
-- when a merchant changes the currency of a future subscription.
ALTER TABLE referral_rewards
  ADD COLUMN IF NOT EXISTS discount_rate_bps integer NOT NULL DEFAULT 3000
  CHECK (discount_rate_bps >= 0 AND discount_rate_bps <= 10000);