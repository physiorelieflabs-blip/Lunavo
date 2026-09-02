CREATE TABLE IF NOT EXISTS customers (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  customer_id integer NOT NULL REFERENCES customers(id),
  order_number text NOT NULL,
  total numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'paid',
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_merchant_email_unique
  ON customers (merchant_id, email);

CREATE UNIQUE INDEX IF NOT EXISTS orders_merchant_order_number_unique
  ON orders (merchant_id, order_number);

CREATE UNIQUE INDEX IF NOT EXISTS orders_merchant_idempotency_unique
  ON orders (merchant_id, idempotency_key);