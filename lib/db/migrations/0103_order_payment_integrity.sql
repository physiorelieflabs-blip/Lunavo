-- 0103: close the final order-payment state bypass at the database boundary.
-- Orders are commercial records, not payment records. A new order is always
-- pending until a verified TS Pay payment intent exists.

ALTER TABLE orders
  ALTER COLUMN status SET DEFAULT 'pending';

CREATE OR REPLACE FUNCTION lunavo_guard_order_paid_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('paid', 'fulfilled') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM payment_intents pi
      WHERE pi.order_id = NEW.id
        AND pi.merchant_id = NEW.merchant_id
        AND pi.status IN ('successful', 'verified')
    ) THEN
      RAISE EXCEPTION 'orders cannot enter paid/fulfilled state without a verified TS Pay payment'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_paid_requires_verified_payment ON orders;

CREATE TRIGGER orders_paid_requires_verified_payment
BEFORE INSERT OR UPDATE OF status, merchant_id
ON orders
FOR EACH ROW
EXECUTE FUNCTION lunavo_guard_order_paid_status();

COMMENT ON TRIGGER orders_paid_requires_verified_payment ON orders IS
  'Prevents client/API/database order status writes from manufacturing paid or fulfilled orders without a verified TS Pay payment intent.';
