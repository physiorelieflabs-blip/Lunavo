ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS gross_amount numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_discount numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_reward_id integer,
  ADD COLUMN IF NOT EXISTS billing_period_key text;

CREATE TABLE IF NOT EXISTS payment_destinations (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  payment_intent_id integer REFERENCES payment_intents(id),
  payment_id integer REFERENCES payments(id),
  order_id integer REFERENCES orders(id),
  provider text NOT NULL,
  bank_name text NOT NULL,
  account_name text NOT NULL,
  account_number text NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL,
  provider_reference text,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  raw_provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_destinations_target_check
    CHECK (payment_intent_id IS NOT NULL OR payment_id IS NOT NULL OR order_id IS NOT NULL)
);
ALTER TABLE payment_destinations
  ADD COLUMN IF NOT EXISTS payment_id integer REFERENCES payments(id);
ALTER TABLE payment_destinations
  DROP CONSTRAINT IF EXISTS payment_destinations_target_check,
  ADD CONSTRAINT payment_destinations_target_check
    CHECK (payment_intent_id IS NOT NULL OR payment_id IS NOT NULL OR order_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS payment_destinations_intent_unique
  ON payment_destinations(payment_intent_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_destinations_payment_unique
  ON payment_destinations(payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_destinations_order_unique
  ON payment_destinations(order_id);
CREATE INDEX IF NOT EXISTS payment_destinations_merchant_status_idx
  ON payment_destinations(merchant_id, status);

CREATE TABLE IF NOT EXISTS referral_periods (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  period_key text NOT NULL,
  code text NOT NULL,
  code_hash text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_periods_valid_range_check CHECK (valid_until > valid_from),
  CONSTRAINT referral_periods_merchant_period_unique UNIQUE (merchant_id, period_key),
  CONSTRAINT referral_periods_code_hash_unique UNIQUE (code_hash)
);
CREATE INDEX IF NOT EXISTS referral_periods_merchant_status_idx
  ON referral_periods(merchant_id, status);

CREATE TABLE IF NOT EXISTS referral_attributions (
  id serial PRIMARY KEY,
  referrer_merchant_id integer NOT NULL REFERENCES merchants(id),
  referred_merchant_id integer NOT NULL REFERENCES merchants(id),
  referral_period_id integer NOT NULL REFERENCES referral_periods(id),
  referral_code_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  qualifying_payment_id integer REFERENCES payments(id),
  qualifying_payment_status text,
  qualifying_amount_minor integer CHECK (qualifying_amount_minor >= 0),
  qualifying_currency text,
  risk_score integer NOT NULL DEFAULT 0 CHECK (risk_score >= 0),
  risk_status text NOT NULL DEFAULT 'clear',
  risk_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT referral_attributions_referred_period_unique
    UNIQUE (referred_merchant_id, referral_period_id),
  CONSTRAINT referral_attributions_qualifying_payment_unique
    UNIQUE (qualifying_payment_id),
  CONSTRAINT referral_attributions_merchants_distinct_check
    CHECK (referrer_merchant_id <> referred_merchant_id)
);
CREATE INDEX IF NOT EXISTS referral_attributions_referrer_created_idx
  ON referral_attributions(referrer_merchant_id, created_at);
CREATE INDEX IF NOT EXISTS referral_attributions_referred_used_idx
  ON referral_attributions(referred_merchant_id, used_at);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  attribution_id integer NOT NULL REFERENCES referral_attributions(id),
  qualifying_payment_id integer NOT NULL REFERENCES payments(id),
  gross_amount_minor integer NOT NULL CHECK (gross_amount_minor >= 0),
  discount_amount_minor integer NOT NULL DEFAULT 0 CHECK (discount_amount_minor >= 0),
  payable_amount_minor integer NOT NULL CHECK (payable_amount_minor >= 0),
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  applied_subscription_id integer REFERENCES subscriptions(id),
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_rewards_attribution_unique UNIQUE (attribution_id),
  CONSTRAINT referral_rewards_qualifying_payment_unique UNIQUE (qualifying_payment_id)
);
CREATE INDEX IF NOT EXISTS referral_rewards_merchant_status_idx
  ON referral_rewards(merchant_id, status);

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_referral_reward_fk
  FOREIGN KEY (referral_reward_id) REFERENCES referral_rewards(id);