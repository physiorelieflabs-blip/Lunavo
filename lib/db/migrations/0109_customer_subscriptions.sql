-- Migration 0109: first-class merchant/customer recurring subscriptions.
-- Financial truth stays in orders/payment_intents/ledger; these tables model cadence, lifecycle and dunning.
CREATE TABLE IF NOT EXISTS customer_subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  product_id integer NOT NULL REFERENCES supplier_products(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency = upper(currency) AND char_length(currency) = 3),
  interval_unit text NOT NULL CHECK (interval_unit IN ('day','week','month','year')),
  interval_count integer NOT NULL CHECK (interval_count BETWEEN 1 AND 12),
  grace_period_days integer NOT NULL DEFAULT 3 CHECK (grace_period_days BETWEEN 0 AND 30),
  max_failed_attempts integer NOT NULL DEFAULT 4 CHECK (max_failed_attempts BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_by text NOT NULL,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, name)
);
CREATE INDEX IF NOT EXISTS customer_subscription_plans_merchant_status_idx ON customer_subscription_plans(merchant_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES customer_subscription_plans(id) ON DELETE RESTRICT,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','active','past_due','paused','cancelled','expired')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency = upper(currency) AND char_length(currency) = 3),
  interval_unit text NOT NULL CHECK (interval_unit IN ('day','week','month','year')),
  interval_count integer NOT NULL CHECK (interval_count BETWEEN 1 AND 12),
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  next_charge_at timestamptz NOT NULL,
  grace_until timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  max_failed_attempts integer NOT NULL DEFAULT 4 CHECK (max_failed_attempts BETWEEN 1 AND 12),
  last_payment_intent_id integer REFERENCES payment_intents(id) ON DELETE SET NULL,
  last_order_id integer REFERENCES orders(id) ON DELETE SET NULL,
  manage_token_hash text NOT NULL UNIQUE,
  manage_token_hint text NOT NULL,
  cancel_reason text,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_subscriptions_merchant_status_idx ON customer_subscriptions(merchant_id,status,next_charge_at);
CREATE INDEX IF NOT EXISTS customer_subscriptions_customer_idx ON customer_subscriptions(merchant_id,customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS customer_subscriptions_due_idx ON customer_subscriptions(status,next_charge_at) WHERE status IN ('active','past_due');

CREATE TABLE IF NOT EXISTS customer_subscription_payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES customer_subscriptions(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  payment_intent_id integer REFERENCES payment_intents(id) ON DELETE SET NULL,
  order_id integer REFERENCES orders(id) ON DELETE SET NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency = upper(currency) AND char_length(currency) = 3),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','submitted','successful','failed','expired','reconciliation_required','refunded','charged_back')),
  due_at timestamptz NOT NULL,
  checkout_url text,
  provider_transaction_id text,
  provider_event_id text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subscription_id,attempt_number),
  UNIQUE(payment_intent_id)
);
CREATE INDEX IF NOT EXISTS customer_subscription_attempts_subscription_idx ON customer_subscription_payment_attempts(subscription_id,created_at DESC);

CREATE TABLE IF NOT EXISTS customer_subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES customer_subscriptions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS customer_subscription_id uuid REFERENCES customer_subscriptions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS payment_intents_customer_subscription_idx ON payment_intents(customer_subscription_id,created_at DESC);
