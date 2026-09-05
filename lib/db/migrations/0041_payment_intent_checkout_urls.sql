ALTER TABLE payment_intents
  ADD COLUMN IF NOT EXISTS checkout_url TEXT;