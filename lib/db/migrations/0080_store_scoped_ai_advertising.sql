ALTER TABLE ai_daily_ad_plans
  ADD COLUMN IF NOT EXISTS storefront_id uuid REFERENCES merchant_storefronts(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS ai_daily_ad_plans_slot_unique;
CREATE UNIQUE INDEX IF NOT EXISTS ai_daily_ad_plans_store_slot_unique
  ON ai_daily_ad_plans (merchant_id, plan_date, storefront_id, slot_index);
CREATE INDEX IF NOT EXISTS ai_daily_ad_plans_store_date_idx
  ON ai_daily_ad_plans (storefront_id, plan_date);
