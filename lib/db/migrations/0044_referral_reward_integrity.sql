-- Migration 0044: Referral integrity checks
ALTER TABLE lunavo.referral_rewards ADD COLUMN IF NOT EXISTS validation_error TEXT;
ALTER TABLE lunavo.referral_rewards ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;
