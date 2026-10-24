-- Admin release gate: every future positive sale ledger posting is held
-- before it can contribute to merchant spendable balance. Existing positive
-- pre-cutover balances are also held as one-time review items, without rewriting
-- or deleting immutable historic ledger rows.
CREATE TABLE IF NOT EXISTS merchant_sale_release_requests (
  id BIGSERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  order_id INTEGER NULL REFERENCES orders(id),
  invoice_id INTEGER NULL REFERENCES invoices(id),
  payment_record_id INTEGER NULL REFERENCES payment_records(id),
  payment_intent_id INTEGER NULL REFERENCES payment_intents(id),
  source_type TEXT NOT NULL CHECK (source_type IN (
    'sale','order_sale','invoice_sale','store_auction_sale','product_auction_sale','legacy_balance'
  )),
  source_reference TEXT NOT NULL,
  release_amount_minor INTEGER NOT NULL CHECK (release_amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  provider_reference TEXT NULL,
  provider_transaction_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN (
    'pending_review','released','disputed','reversed','reconciliation_required'
  )),
  reviewed_by TEXT NULL,
  reviewed_at TIMESTAMPTZ NULL,
  review_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_reference)
);

CREATE INDEX IF NOT EXISTS merchant_sale_release_review_idx
  ON merchant_sale_release_requests (status, created_at ASC);
CREATE INDEX IF NOT EXISTS merchant_sale_release_merchant_idx
  ON merchant_sale_release_requests (merchant_id, currency, status);
CREATE INDEX IF NOT EXISTS merchant_sale_release_payment_idx
  ON merchant_sale_release_requests (payment_intent_id, status)
  WHERE payment_intent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION lunavo_project_ledger_to_dashboard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  signed_amount bigint := NEW.amount_minor;
  kind text := CASE
    WHEN NEW.entry_type IN ('internal_transfer_out','internal_transfer_in') THEN 'internal_transfer'
    WHEN NEW.entry_type LIKE 'withdrawal_%' THEN 'withdrawal'
    WHEN NEW.entry_type = 'refund' THEN 'refund'
    WHEN NEW.entry_type = 'fee' THEN 'sale'
    ELSE 'sale'
  END;
  verification text := CASE WHEN NEW.entry_type = 'adjustment' THEN 'reconciliation_required' ELSE 'verified' END;
  sale_source_type text;
  linked_payment_intent_id integer;
  linked_provider_reference text;
  linked_provider_transaction_id text;
BEGIN
  INSERT INTO lunavo_dashboard_transactions (
    merchant_id, transaction_type, transaction_kind, status,
    amount_minor, currency, lunavo_fee_minor, provider_fee_minor,
    merchant_net_minor, internal_reference, idempotency_key, source,
    verification_state, verified_at, metadata
  ) VALUES (
    NEW.merchant_id, 'ledger_' || NEW.entry_type, kind,
    CASE WHEN NEW.entry_type = 'adjustment' THEN 'reconciliation_required' ELSE 'confirmed' END,
    ABS(signed_amount), NEW.currency,
    CASE WHEN NEW.entry_type = 'fee' THEN ABS(signed_amount) ELSE 0 END,
    0, signed_amount,
    'LEDGER-' || NEW.id, 'ledger:' || NEW.id, 'ts_pay_ledger_projection',
    verification, CASE WHEN verification = 'verified' THEN now() ELSE NULL END,
    jsonb_build_object(
      'ledgerEntryId', NEW.id,
      'orderId', NEW.order_id,
      'paymentRecordId', NEW.payment_record_id,
      'withdrawalId', NEW.withdrawal_id,
      'refundId', NEW.refund_id,
      'entryType', NEW.entry_type,
      'direction', CASE WHEN signed_amount < 0 THEN 'debit' ELSE 'credit' END
    )
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  IF NEW.entry_type = 'sale' AND NEW.amount_minor > 0 THEN
    sale_source_type := CASE
      WHEN NEW.reference_key LIKE 'store-auction-sale:%' THEN 'store_auction_sale'
      WHEN NEW.reference_key LIKE 'product-auction:%:sale' THEN 'product_auction_sale'
      WHEN NEW.invoice_id IS NOT NULL OR NEW.reference_key LIKE 'invoice-%' THEN 'invoice_sale'
      WHEN NEW.order_id IS NOT NULL THEN 'order_sale'
      ELSE 'sale'
    END;

    IF NEW.payment_record_id IS NOT NULL THEN
      SELECT pr.intent_id, pr.evidence_reference, pi.provider_transaction_id
        INTO linked_payment_intent_id, linked_provider_reference, linked_provider_transaction_id
      FROM payment_records pr
      LEFT JOIN payment_intents pi ON pi.id = pr.intent_id
      WHERE pr.id = NEW.payment_record_id;
    END IF;
    IF linked_payment_intent_id IS NULL AND NEW.reference_key ~ '^payment:[0-9]+$' THEN
      linked_payment_intent_id := substring(NEW.reference_key FROM '^payment:([0-9]+)$')::integer;
    END IF;
    IF linked_payment_intent_id IS NOT NULL THEN
      SELECT COALESCE(linked_provider_reference, pi.evidence_reference),
             COALESCE(linked_provider_transaction_id, pi.provider_transaction_id)
        INTO linked_provider_reference, linked_provider_transaction_id
      FROM payment_intents pi
      WHERE pi.id = linked_payment_intent_id;
    END IF;

    INSERT INTO merchant_sale_release_requests (
      merchant_id, order_id, invoice_id, payment_record_id, payment_intent_id,
      source_type, source_reference, release_amount_minor, currency,
      provider_reference, provider_transaction_id, status
    ) VALUES (
      NEW.merchant_id, NEW.order_id, NEW.invoice_id, NEW.payment_record_id,
      linked_payment_intent_id, sale_source_type, NEW.reference_key,
      NEW.amount_minor, upper(NEW.currency), linked_provider_reference,
      linked_provider_transaction_id, 'pending_review'
    ) ON CONFLICT (source_type, source_reference) DO NOTHING;

    INSERT INTO ledger_entries (
      merchant_id, order_id, invoice_id, payment_record_id,
      amount_minor, currency, entry_type, reference_key
    ) VALUES (
      NEW.merchant_id, NEW.order_id, NEW.invoice_id, NEW.payment_record_id,
      -NEW.amount_minor, upper(NEW.currency), 'sale_release_hold',
      'sale-release-hold:' || NEW.reference_key
    ) ON CONFLICT (reference_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- A balance larger than one signed ledger integer cannot be represented by a
-- single release request; fail the migration rather than leaving funds available.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT merchant_id, upper(currency) AS currency, SUM(amount_minor)::bigint AS balance_minor
      FROM ledger_entries
      WHERE entry_type NOT IN ('withdrawal_reserve','withdrawal_release')
      GROUP BY merchant_id, upper(currency)
      HAVING SUM(amount_minor) > 2147483647
    ) oversized
  ) THEN
    RAISE EXCEPTION 'Positive legacy merchant balance exceeds one ledger entry; reconcile/split it before enabling the sale release gate';
  END IF;
END;
$$;

INSERT INTO merchant_sale_release_requests (
  merchant_id, source_type, source_reference, release_amount_minor, currency,
  status, review_note
)
SELECT
  balances.merchant_id,
  'legacy_balance',
  'migration-cutover:' || balances.merchant_id::text || ':' || upper(balances.currency),
  balances.balance_minor::integer,
  upper(balances.currency),
  'pending_review',
  'Pre-cutover positive balance frozen for Master Admin review'
FROM (
  SELECT merchant_id, upper(currency) AS currency, SUM(amount_minor)::bigint AS balance_minor
  FROM ledger_entries
  WHERE entry_type NOT IN ('withdrawal_reserve','withdrawal_release')
  GROUP BY merchant_id, upper(currency)
  HAVING SUM(amount_minor) > 0
) balances
ON CONFLICT (source_type, source_reference) DO NOTHING;

INSERT INTO ledger_entries (
  merchant_id, amount_minor, currency, entry_type, reference_key
)
SELECT
  r.merchant_id,
  -r.release_amount_minor,
  r.currency,
  'sale_release_hold',
  'sale-release-hold:' || r.source_reference
FROM merchant_sale_release_requests r
WHERE r.source_type = 'legacy_balance'
  AND r.status = 'pending_review'
  AND NOT EXISTS (
    SELECT 1 FROM ledger_entries le
    WHERE le.reference_key = 'sale-release-hold:' || r.source_reference
  )
ON CONFLICT (reference_key) DO NOTHING;
