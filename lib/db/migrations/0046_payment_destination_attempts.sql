DROP INDEX IF EXISTS "payment_destinations_intent_unique";
DROP INDEX IF EXISTS "payment_destinations_payment_unique";
DROP INDEX IF EXISTS "payment_destinations_order_unique";

CREATE INDEX IF NOT EXISTS "payment_destinations_intent_idx"
  ON "payment_destinations" ("payment_intent_id");
CREATE INDEX IF NOT EXISTS "payment_destinations_payment_idx"
  ON "payment_destinations" ("payment_id");
CREATE INDEX IF NOT EXISTS "payment_destinations_order_idx"
  ON "payment_destinations" ("order_id");