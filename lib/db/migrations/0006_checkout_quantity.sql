ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "quantity" integer NOT NULL DEFAULT 1;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_quantity_positive_check"
    CHECK ("quantity" > 0);