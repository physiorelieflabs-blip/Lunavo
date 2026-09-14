-- Migration 0047: Referral milestone tracking
ALTER TABLE lunavo.referral_rewards ADD COLUMN IF NOT EXISTS milestone_reached_at TIMESTAMPTZ;
ALTER TABLE lunavo.referral_rewards ADD COLUMN IF NOT EXISTS free_month_applied BOOLEAN DEFAULT FALSE;
