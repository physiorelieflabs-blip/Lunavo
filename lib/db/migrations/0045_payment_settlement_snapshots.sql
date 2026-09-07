ALTER TABLE "payment_intents"
  ADD COLUMN IF NOT EXISTS "settlement_amount_minor" integer,
  ADD COLUMN IF NOT EXISTS "settlement_currency" text,
  ADD COLUMN IF NOT EXISTS "fx_rate" numeric(18, 8);