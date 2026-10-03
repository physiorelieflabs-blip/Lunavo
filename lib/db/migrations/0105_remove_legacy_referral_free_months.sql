-- Migration 0105: retire the legacy 150-referral/12-free-month reward path.
-- Historical referral milestone rows remain for audit history, but can no longer
-- create subscription value. Active subscription entitlements are reset to zero.
UPDATE subscriptions
SET referral_free_months = 0
WHERE referral_free_months <> 0;

UPDATE referral_milestones
SET status = 'reversed'
WHERE status = 'granted';
