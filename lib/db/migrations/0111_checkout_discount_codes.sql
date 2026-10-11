-- Server-authoritative checkout promo codes and usage-limit reservations.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_code text;

CREATE TABLE IF NOT EXISTS discount_codes (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  code text NOT NULL,
  kind text NOT NULL DEFAULT 'percentage',
  value numeric(12,2) NOT NULL,
  minimum_subtotal numeric(12,2) NOT NULL DEFAULT 0,
  currency text,
  usage_limit integer,
  usage_count integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS minimum_subtotal numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS usage_limit integer;
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0;
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS discount_codes_merchant_code_unique ON discount_codes(merchant_id,code);

CREATE TABLE IF NOT EXISTS discount_code_reservations (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  discount_code_id integer NOT NULL REFERENCES discount_codes(id) ON DELETE CASCADE,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','redeemed','released','expired')),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS discount_code_reservations_order_unique ON discount_code_reservations(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS discount_code_reservations_merchant_order_code_unique ON discount_code_reservations(merchant_id,order_id,discount_code_id);
CREATE INDEX IF NOT EXISTS discount_code_reservations_capacity_idx ON discount_code_reservations(merchant_id,discount_code_id,status,expires_at);
