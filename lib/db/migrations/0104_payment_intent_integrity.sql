-- 0104: provider-backed payment intent integrity.
-- A provider-backed payment intent cannot become financially successful
-- without a real provider transaction identifier.

ALTER TABLE payment_intents
  ADD CONSTRAINT payment_intents_amount_positive
  CHECK (amount_minor > 0);

ALTER TABLE payment_intents
  ADD CONSTRAINT payment_intents_currency_iso
  CHECK (currency = upper(currency) AND char_length(currency) = 3);

CREATE OR REPLACE FUNCTION lunavo_guard_provider_payment_intent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('successful','verified')
     AND lower(btrim(NEW.method)) IN ('flutterwave','paystack','stripe','paypal')
     AND nullif(btrim(NEW.provider_transaction_id), '') IS NULL THEN
    RAISE EXCEPTION 'provider-backed payment intents require provider transaction verification before success'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_intent_provider_success_guard ON payment_intents;

CREATE TRIGGER payment_intent_provider_success_guard
BEFORE INSERT OR UPDATE OF status, method, provider_transaction_id
ON payment_intents
FOR EACH ROW
EXECUTE FUNCTION lunavo_guard_provider_payment_intent();
