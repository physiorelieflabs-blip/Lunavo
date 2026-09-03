ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS public_payment_token text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_public_payment_token_unique
  ON orders(public_payment_token)
  WHERE public_payment_token IS NOT NULL;

ALTER TABLE payment_intents
  DROP CONSTRAINT IF EXISTS payment_intents_method_check;

ALTER TABLE payment_intents
  ADD CONSTRAINT payment_intents_method_check
  CHECK (method IN ('manual_bank_transfer','manual_cash','manual_other','whop_hosted'));