CREATE TABLE IF NOT EXISTS "merchant_bank_accounts" (
  "id" serial PRIMARY KEY,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id"),
  "beneficiary_name" text NOT NULL,
  "bank_name" text NOT NULL,
  "bank_code" text NOT NULL,
  "account_number_ciphertext" text NOT NULL,
  "account_last4" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "merchant_bank_accounts_merchant_id_unique"
  ON "merchant_bank_accounts" ("merchant_id");