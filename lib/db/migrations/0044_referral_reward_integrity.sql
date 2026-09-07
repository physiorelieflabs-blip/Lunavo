CREATE UNIQUE INDEX IF NOT EXISTS referral_attributions_one_qualified_reward_unique
  ON referral_attributions(referred_merchant_id)
  WHERE qualifying_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_one_subscription_application_unique
  ON referral_rewards(applied_subscription_id)
  WHERE applied_subscription_id IS NOT NULL;