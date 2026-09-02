CREATE TABLE IF NOT EXISTS merchants (
  id serial PRIMARY KEY,
  clerk_user_id text UNIQUE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  store_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  registered_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  amount_due numeric(12, 2) NOT NULL DEFAULT 30,
  amount_paid numeric(12, 2) NOT NULL DEFAULT 0,
  earnings_held numeric(12, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  payment_method text
);

CREATE TABLE IF NOT EXISTS payments (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  method text NOT NULL,
  reference text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  amount numeric(12, 2),
  currency text NOT NULL DEFAULT 'USD',
  tone text NOT NULL DEFAULT 'neutral',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE subscriptions
SET updated_at = now()
WHERE updated_at IS NULL;

ALTER TABLE subscriptions
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

DELETE FROM activity
WHERE merchant_id IN (
  SELECT id
  FROM merchants
  WHERE email IN (
    'maya@example.com',
    'atlas@example.com',
    'merchant@demo.tscommerce.local'
  )
  OR (email = 'ifeoluwaolowu4@gmail.com' AND clerk_user_id IS NULL)
);

DELETE FROM payments
WHERE merchant_id IN (
  SELECT id
  FROM merchants
  WHERE email IN (
    'maya@example.com',
    'atlas@example.com',
    'merchant@demo.tscommerce.local'
  )
  OR (email = 'ifeoluwaolowu4@gmail.com' AND clerk_user_id IS NULL)
);

DELETE FROM subscriptions
WHERE merchant_id IN (
  SELECT id
  FROM merchants
  WHERE email IN (
    'maya@example.com',
    'atlas@example.com',
    'merchant@demo.tscommerce.local'
  )
  OR (email = 'ifeoluwaolowu4@gmail.com' AND clerk_user_id IS NULL)
);

DELETE FROM merchants
WHERE email IN (
  'maya@example.com',
  'atlas@example.com',
  'merchant@demo.tscommerce.local'
)
OR (email = 'ifeoluwaolowu4@gmail.com' AND clerk_user_id IS NULL);

WITH subscription_rollup AS (
  SELECT
    merchant_id,
    min(id) AS keep_id,
    max(amount_due) AS amount_due,
    least(max(amount_due), sum(amount_paid)) AS amount_paid,
    sum(earnings_held) AS earnings_held,
    CASE
      WHEN sum(amount_paid) >= max(amount_due) THEN 'active'
      WHEN bool_or(status = 'expired') THEN 'expired'
      WHEN bool_or(status = 'past_due') THEN 'past_due'
      ELSE 'pending'
    END AS status,
    max(payment_method) FILTER (WHERE payment_method IS NOT NULL) AS payment_method,
    max(updated_at) AS updated_at,
    count(*) AS row_count
  FROM subscriptions
  GROUP BY merchant_id
)
UPDATE subscriptions AS subscription
SET
  amount_due = rollup.amount_due,
  amount_paid = rollup.amount_paid,
  earnings_held = rollup.earnings_held,
  status = rollup.status,
  payment_method = rollup.payment_method,
  updated_at = rollup.updated_at
FROM subscription_rollup AS rollup
WHERE subscription.id = rollup.keep_id
  AND rollup.row_count > 1;

WITH subscription_rollup AS (
  SELECT merchant_id, min(id) AS keep_id
  FROM subscriptions
  GROUP BY merchant_id
  HAVING count(*) > 1
)
DELETE FROM subscriptions AS duplicate
USING subscription_rollup AS rollup
WHERE duplicate.merchant_id = rollup.merchant_id
  AND duplicate.id <> rollup.keep_id;

DROP INDEX IF EXISTS payments_merchant_reference_unique;
DROP INDEX IF EXISTS payments_reference_unique;

UPDATE payments
SET reference = upper(btrim(reference));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM payments
    GROUP BY upper(btrim(reference))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce global payment-reference uniqueness: duplicate legacy references require manual reconciliation';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_merchant_id_unique
  ON subscriptions (merchant_id);

CREATE UNIQUE INDEX payments_reference_unique
  ON payments (upper(btrim(reference)));