-- Server-enforced public checkout promotions with expiring redemption reservations.
-- Usage limits reserve capacity while checkout is pending, then count only verified payments.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_code_snapshot text;

CREATE TABLE IF NOT EXISTS discount_code_redemptions (
  order_id integer PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  discount_code_id integer NOT NULL REFERENCES discount_codes(id) ON DELETE RESTRICT,
  code_snapshot text NOT NULL CHECK (code_snapshot ~ '^[A-Z0-9_-]{3,40}$'),
  discount_amount_minor bigint NOT NULL CHECK (discount_amount_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','redeemed','released')),
  reserved_until timestamptz NOT NULL,
  redeemed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'redeemed' OR redeemed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS discount_code_redemptions_capacity_idx
  ON discount_code_redemptions(discount_code_id, status, reserved_until);
CREATE INDEX IF NOT EXISTS discount_code_redemptions_merchant_created_idx
  ON discount_code_redemptions(merchant_id, created_at DESC);
