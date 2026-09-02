CREATE TABLE IF NOT EXISTS "withdrawal_security" (
  "id" serial PRIMARY KEY,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id"),
  "totp_secret_ciphertext" text,
  "pending_totp_secret_ciphertext" text,
  "pending_totp_expires_at" timestamptz,
  "enabled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "withdrawal_security_merchant_id_unique"
  ON "withdrawal_security" ("merchant_id");

CREATE TABLE IF NOT EXISTS "withdrawals" (
  "id" serial PRIMARY KEY,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id"),
  "amount" numeric(12, 2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "status" text NOT NULL DEFAULT 'pending',
  "beneficiary_name" text NOT NULL,
  "bank_name" text NOT NULL,
  "destination_ciphertext" text NOT NULL,
  "account_last4" text NOT NULL,
  "idempotency_key" text,
  "reviewed_by" text,
  "review_note" text,
  "reviewed_at" timestamptz,
  "paid_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "withdrawals_merchant_idempotency_unique"
  ON "withdrawals" ("merchant_id", "idempotency_key");

CREATE TABLE IF NOT EXISTS "supplier_products" (
  "id" serial PRIMARY KEY,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id"),
  "source_url" text NOT NULL,
  "source_domain" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "image_url" text,
  "price" numeric(12, 2),
  "currency" text NOT NULL DEFAULT 'USD',
  "status" text NOT NULL DEFAULT 'imported',
  "imported_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_products_merchant_url_unique"
  ON "supplier_products" ("merchant_id", "source_url");