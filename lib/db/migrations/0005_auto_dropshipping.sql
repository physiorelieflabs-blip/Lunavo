ALTER TABLE "supplier_products"
  ADD COLUMN IF NOT EXISTS "supplier_url" text;

UPDATE "supplier_products"
SET "supplier_url" = "source_url"
WHERE "supplier_url" IS NULL;

ALTER TABLE "supplier_products"
  ALTER COLUMN "supplier_url" SET NOT NULL,
  ADD COLUMN IF NOT EXISTS "profit_type" text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS "profit_value" numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "selling_price" numeric(12, 2);

UPDATE "supplier_products"
SET "selling_price" = round(("price" + "profit_value")::numeric, 2)
WHERE "price" IS NOT NULL AND "selling_price" IS NULL;

ALTER TABLE "supplier_products"
  ADD CONSTRAINT "supplier_products_profit_type_check"
    CHECK ("profit_type" IN ('fixed', 'percentage')),
  ADD CONSTRAINT "supplier_products_profit_value_check"
    CHECK ("profit_value" >= 0);

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "supplier_product_id" integer REFERENCES "supplier_products"("id"),
  ADD COLUMN IF NOT EXISTS "shipping_address" text,
  ADD COLUMN IF NOT EXISTS "fulfillment_status" text NOT NULL DEFAULT 'not_applicable';

CREATE INDEX IF NOT EXISTS "supplier_products_merchant_status_idx"
  ON "supplier_products" ("merchant_id", "status");

CREATE INDEX IF NOT EXISTS "orders_merchant_fulfillment_idx"
  ON "orders" ("merchant_id", "fulfillment_status", "created_at");