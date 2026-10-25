-- Freeze pre-gate credits and backfill all historic verified merchant sale paths.
-- Historical immutable sale/fee/refund rows remain unchanged. A separate negative
-- marker freezes the current ledger contribution; a later Admin release reverses
-- that marker and records any fee lines missing from the historical ledger.
ALTER TABLE merchant_fund_release_reviews
  ADD COLUMN IF NOT EXISTS legacy_hold BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE merchant_fund_release_reviews
  ADD COLUMN IF NOT EXISTS invoice_id INTEGER REFERENCES invoices(id) ON DELETE RESTRICT;
ALTER TABLE merchant_fund_release_reviews
  ADD COLUMN IF NOT EXISTS provider_amount_minor BIGINT;
ALTER TABLE merchant_fund_release_reviews
  ADD COLUMN IF NOT EXISTS provider_currency TEXT;
ALTER TABLE merchant_fund_release_reviews
  ADD COLUMN IF NOT EXISTS provider_fee_evidence_minor BIGINT;
ALTER TABLE merchant_fund_release_reviews
  ADD COLUMN IF NOT EXISTS held_amount_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE merchant_fund_release_reviews
  ADD COLUMN IF NOT EXISTS legacy_provider_fee_posted_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE merchant_fund_release_reviews
  ADD COLUMN IF NOT EXISTS legacy_lunavo_fee_posted_minor BIGINT NOT NULL DEFAULT 0;

-- Safe defaults support rerunning this migration against a test database created
-- from an earlier draft of the queue schema. Fresh queues preserve the real provider
-- amount/currency separately from the merchant ledger amount/currency.
UPDATE merchant_fund_release_reviews
SET provider_amount_minor=COALESCE(provider_amount_minor,amount_minor),
    provider_currency=COALESCE(provider_currency,currency),
    provider_fee_evidence_minor=COALESCE(provider_fee_evidence_minor,provider_fee_minor)
WHERE provider_amount_minor IS NULL OR provider_currency IS NULL;

ALTER TABLE merchant_fund_release_reviews
  ALTER COLUMN provider_amount_minor SET NOT NULL;
ALTER TABLE merchant_fund_release_reviews
  ALTER COLUMN provider_currency SET NOT NULL;
ALTER TABLE merchant_fund_release_reviews
  DROP CONSTRAINT IF EXISTS merchant_fund_release_provider_amount_check;
ALTER TABLE merchant_fund_release_reviews
  ADD CONSTRAINT merchant_fund_release_provider_amount_check
  CHECK (provider_amount_minor > 0 AND provider_currency = upper(provider_currency)
         AND provider_currency ~ '^[A-Z]{3}$');
ALTER TABLE merchant_fund_release_reviews
  DROP CONSTRAINT IF EXISTS merchant_fund_release_net_math;
ALTER TABLE merchant_fund_release_reviews
  ADD CONSTRAINT merchant_fund_release_net_math
  CHECK (legacy_hold OR merchant_net_minor = amount_minor - provider_fee_minor - lunavo_fee_minor);

-- Extend the immutable source guard to cover migration-held and provider-evidence data.
CREATE OR REPLACE FUNCTION lunavo_guard_fund_release_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Merchant fund-release review history is immutable';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.merchant_id IS DISTINCT FROM OLD.merchant_id
     OR NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
     OR NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
     OR NEW.payment_record_id IS DISTINCT FROM OLD.payment_record_id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id
     OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
     OR NEW.provider_amount_minor IS DISTINCT FROM OLD.provider_amount_minor
     OR NEW.provider_currency IS DISTINCT FROM OLD.provider_currency
     OR NEW.provider_fee_evidence_minor IS DISTINCT FROM OLD.provider_fee_evidence_minor
     OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.provider_fee_minor IS DISTINCT FROM OLD.provider_fee_minor
     OR NEW.lunavo_fee_minor IS DISTINCT FROM OLD.lunavo_fee_minor
     OR NEW.merchant_net_minor IS DISTINCT FROM OLD.merchant_net_minor
     OR NEW.held_amount_minor IS DISTINCT FROM OLD.held_amount_minor
     OR NEW.legacy_provider_fee_posted_minor IS DISTINCT FROM OLD.legacy_provider_fee_posted_minor
     OR NEW.legacy_lunavo_fee_posted_minor IS DISTINCT FROM OLD.legacy_lunavo_fee_posted_minor
     OR NEW.legacy_hold IS DISTINCT FROM OLD.legacy_hold
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Merchant fund-release source and amount are immutable';
  END IF;

  -- Re-opening is permitted only after the API freshly verifies provider evidence.
  IF OLD.status = 'reconciliation_required' AND NEW.status = 'pending' THEN
    IF NEW.reviewed_at IS NOT NULL OR NEW.reviewed_by IS NOT NULL THEN
      RAISE EXCEPTION 'Re-opened review must clear the prior decision fields';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'A finalized merchant fund-release review cannot be changed';
  END IF;
  IF NEW.status NOT IN ('released','cancelled','reconciliation_required') THEN
    RAISE EXCEPTION 'Invalid merchant fund-release state transition';
  END IF;
  IF NEW.reviewed_at IS NULL OR NEW.reviewed_by IS NULL THEN
    RAISE EXCEPTION 'Every fund-release decision requires reviewer identity and timestamp';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_entry_type_check;
ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_entry_type_check
  CHECK (entry_type IN (
    'sale','fee','refund','withdrawal_reserve','withdrawal_release','withdrawal_paid',
    'adjustment','internal_transfer_out','internal_transfer_in',
    'merchant_funds_hold','merchant_funds_release'
  ));

-- A release review cannot be inserted already finalized. Every first-write source
-- enters pending or reconciliation_required; only the guarded update flow can release it.
CREATE OR REPLACE FUNCTION lunavo_guard_fund_release_review_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status NOT IN ('pending','reconciliation_required') THEN
    RAISE EXCEPTION 'Fund-release reviews must be created pending or quarantined';
  END IF;
  IF NEW.status='pending' AND (NEW.reviewed_at IS NOT NULL OR NEW.reviewed_by IS NOT NULL) THEN
    RAISE EXCEPTION 'Pending fund-release review cannot contain a finalized reviewer';
  END IF;
  IF NEW.status='reconciliation_required' AND (NEW.reviewed_at IS NULL OR NEW.reviewed_by IS NULL) THEN
    RAISE EXCEPTION 'Quarantined fund-release review requires a reviewer and timestamp';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_fund_release_review_insert_guard ON merchant_fund_release_reviews;
CREATE TRIGGER merchant_fund_release_review_insert_guard
BEFORE INSERT ON merchant_fund_release_reviews
FOR EACH ROW EXECUTE FUNCTION lunavo_guard_fund_release_review_insert();

-- Make PostgreSQL itself reject positive seller sale credits unless a matching
-- Master Admin release row has already been finalized in this same transaction.
CREATE OR REPLACE FUNCTION lunavo_guard_merchant_fund_ledger_credit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  review merchant_fund_release_reviews%ROWTYPE;
BEGIN
  IF NEW.entry_type='sale' AND NEW.amount_minor > 0 THEN
    SELECT r.* INTO review
    FROM merchant_fund_release_reviews r
    WHERE r.status='released'
      AND r.legacy_hold=FALSE
      AND r.merchant_id=NEW.merchant_id
      AND r.source_reference || ':released-sale'=NEW.reference_key
    LIMIT 1;
    IF NOT FOUND
       OR review.amount_minor IS DISTINCT FROM NEW.amount_minor
       OR upper(review.currency) IS DISTINCT FROM upper(NEW.currency)
       OR review.order_id IS DISTINCT FROM NEW.order_id
       OR review.invoice_id IS DISTINCT FROM NEW.invoice_id
       OR review.payment_record_id IS DISTINCT FROM NEW.payment_record_id THEN
      RAISE EXCEPTION 'Positive sale ledger credits require a matching released Master Admin fund review';
    END IF;
  ELSIF NEW.entry_type='merchant_funds_release' AND NEW.amount_minor > 0 THEN
    SELECT r.* INTO review
    FROM merchant_fund_release_reviews r
    WHERE r.status='released'
      AND r.legacy_hold=TRUE
      AND r.merchant_id=NEW.merchant_id
      AND 'merchant-fund-release:legacy-release:' || r.source_reference=NEW.reference_key
    LIMIT 1;
    IF NOT FOUND
       OR review.held_amount_minor IS DISTINCT FROM NEW.amount_minor
       OR upper(review.currency) IS DISTINCT FROM upper(NEW.currency)
       OR review.order_id IS DISTINCT FROM NEW.order_id
       OR review.invoice_id IS DISTINCT FROM NEW.invoice_id
       OR review.payment_record_id IS DISTINCT FROM NEW.payment_record_id THEN
      RAISE EXCEPTION 'Positive merchant-funds release requires a matching legacy hold and released review';
    END IF;
  ELSIF NEW.entry_type='merchant_funds_hold' THEN
    SELECT r.* INTO review
    FROM merchant_fund_release_reviews r
    WHERE r.legacy_hold=TRUE
      AND r.status IN ('pending','reconciliation_required')
      AND r.merchant_id=NEW.merchant_id
      AND 'merchant-fund-release:legacy-hold:' || r.source_reference=NEW.reference_key
    LIMIT 1;
    IF NOT FOUND
       OR review.held_amount_minor <= 0
       OR NEW.amount_minor IS DISTINCT FROM -review.held_amount_minor
       OR upper(review.currency) IS DISTINCT FROM upper(NEW.currency)
       OR review.order_id IS DISTINCT FROM NEW.order_id
       OR review.invoice_id IS DISTINCT FROM NEW.invoice_id
       OR review.payment_record_id IS DISTINCT FROM NEW.payment_record_id THEN
      RAISE EXCEPTION 'Merchant funds hold must equal a queued historical ledger contribution';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_fund_ledger_credit_guard ON ledger_entries;
CREATE TRIGGER merchant_fund_ledger_credit_guard
BEFORE INSERT ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION lunavo_guard_merchant_fund_ledger_credit();

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
    WHEN NEW.entry_type IN ('merchant_funds_hold','merchant_funds_release') THEN 'sale'
    WHEN NEW.entry_type = 'fee' THEN 'sale'
    ELSE 'sale'
  END;
  verification text := CASE
    WHEN NEW.entry_type = 'adjustment' THEN 'reconciliation_required'
    WHEN NEW.entry_type = 'merchant_funds_hold' THEN 'unverified'
    ELSE 'verified'
  END;
  projected_status text := CASE
    WHEN NEW.entry_type = 'adjustment' THEN 'reconciliation_required'
    WHEN NEW.entry_type = 'merchant_funds_hold' THEN 'pending'
    ELSE 'confirmed'
  END;
BEGIN
  INSERT INTO lunavo_dashboard_transactions (
    merchant_id, transaction_type, transaction_kind, status,
    amount_minor, currency, lunavo_fee_minor, provider_fee_minor,
    merchant_net_minor, internal_reference, idempotency_key, source,
    verification_state, verified_at, metadata
  ) VALUES (
    NEW.merchant_id, 'ledger_' || NEW.entry_type, kind, projected_status,
    ABS(signed_amount), NEW.currency,
    CASE WHEN NEW.entry_type = 'fee' THEN ABS(signed_amount) ELSE 0 END,
    0, signed_amount,
    'LEDGER-' || NEW.id, 'ledger:' || NEW.id, 'ts_pay_ledger_projection',
    verification, CASE WHEN verification = 'verified' THEN now() ELSE NULL END,
    jsonb_build_object(
      'ledgerEntryId', NEW.id,
      'orderId', NEW.order_id,
      'invoiceId', NEW.invoice_id,
      'paymentRecordId', NEW.payment_record_id,
      'withdrawalId', NEW.withdrawal_id,
      'refundId', NEW.refund_id,
      'entryType', NEW.entry_type,
      'direction', CASE WHEN signed_amount < 0 THEN 'debit' ELSE 'credit' END
    )
  ) ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Historical order checkout and merchant-verified order payment paths.
INSERT INTO merchant_fund_release_reviews (
  merchant_id,source_type,source_reference,payment_intent_id,order_id,invoice_id,payment_record_id,
  provider,provider_transaction_id,provider_reference,provider_amount_minor,provider_currency,
  provider_fee_evidence_minor,amount_minor,currency,provider_fee_minor,lunavo_fee_minor,merchant_net_minor,
  held_amount_minor,legacy_provider_fee_posted_minor,legacy_lunavo_fee_posted_minor,
  status,review_note,reviewed_by,reviewed_at,legacy_hold
)
SELECT
  p.merchant_id,'order_payment','payment:' || p.id::text,p.id,p.order_id,NULL,pr.id,
  CASE WHEN NULLIF(COALESCE(NULLIF(p.provider_transaction_id,''),CASE WHEN p.method='flutterwave' THEN pr.evidence_reference END),'') IS NOT NULL
       THEN 'flutterwave' ELSE 'manual_evidence' END,
  COALESCE(NULLIF(p.provider_transaction_id,''),CASE WHEN p.method='flutterwave' THEN NULLIF(pr.evidence_reference,'') END,'MANUAL-ORDER-EVIDENCE:' || p.id::text),
  CASE WHEN p.method='flutterwave' THEN p.evidence_reference ELSE NULL END,
  p.amount_minor,upper(p.currency),p.provider_fee_minor,
  sale.amount_minor,upper(sale.currency),
  calc.provider_fee_minor,calc.lunavo_fee_minor,
  GREATEST(0,sale.amount_minor-calc.provider_fee_minor-calc.lunavo_fee_minor),
  GREATEST(0,COALESCE(current_net.amount_minor,0)),
  GREATEST(0,COALESCE(-provider_fee.amount_minor,0)),
  GREATEST(0,COALESCE(-lunavo_fee.amount_minor,0)),
  CASE
    WHEN NULLIF(COALESCE(NULLIF(p.provider_transaction_id,''),CASE WHEN p.method='flutterwave' THEN pr.evidence_reference END),'') IS NOT NULL
      AND p.status IN ('successful','verified') AND pr.status IN ('successful','verified')
      AND COALESCE(current_net.amount_minor,0) >= GREATEST(0,sale.amount_minor-calc.provider_fee_minor-calc.lunavo_fee_minor)
      AND NOT EXISTS (SELECT 1 FROM payment_reconciliation_exceptions e WHERE e.payment_intent_id=p.id
                      AND e.resolved_at IS NULL AND e.status NOT IN ('resolved','closed','dismissed'))
    THEN 'pending' ELSE 'reconciliation_required'
  END,
  CASE
    WHEN NULLIF(COALESCE(NULLIF(p.provider_transaction_id,''),CASE WHEN p.method='flutterwave' THEN pr.evidence_reference END),'') IS NULL
      THEN 'Legacy payment is missing provider transaction evidence'
    WHEN EXISTS (SELECT 1 FROM payment_reconciliation_exceptions e WHERE e.payment_intent_id=p.id
                 AND e.resolved_at IS NULL AND e.status NOT IN ('resolved','closed','dismissed'))
      THEN 'Legacy sale has an unresolved payment reconciliation exception'
    WHEN COALESCE(current_net.amount_minor,0) < GREATEST(0,sale.amount_minor-calc.provider_fee_minor-calc.lunavo_fee_minor)
      THEN 'Historical ledger net is below expected merchant proceeds; Finance reconciliation required'
    WHEN calc.provider_fee_minor < GREATEST(0,COALESCE(-provider_fee.amount_minor,0))
      OR calc.lunavo_fee_minor < GREATEST(0,COALESCE(-lunavo_fee.amount_minor,0))
      THEN 'Historical fee debits exceed configured fee amounts; Finance reconciliation required'
    WHEN p.status NOT IN ('successful','verified') OR pr.status NOT IN ('successful','verified')
      THEN 'Historical payment state requires Finance reconciliation'
    ELSE NULL
  END,
  CASE
    WHEN NULLIF(COALESCE(NULLIF(p.provider_transaction_id,''),CASE WHEN p.method='flutterwave' THEN pr.evidence_reference END),'') IS NOT NULL
      AND p.status IN ('successful','verified') AND pr.status IN ('successful','verified')
      AND COALESCE(current_net.amount_minor,0) >= GREATEST(0,sale.amount_minor-calc.provider_fee_minor-calc.lunavo_fee_minor)
      AND calc.provider_fee_minor >= GREATEST(0,COALESCE(-provider_fee.amount_minor,0))
      AND calc.lunavo_fee_minor >= GREATEST(0,COALESCE(-lunavo_fee.amount_minor,0))
      AND NOT EXISTS (SELECT 1 FROM payment_reconciliation_exceptions e WHERE e.payment_intent_id=p.id
                      AND e.resolved_at IS NULL AND e.status NOT IN ('resolved','closed','dismissed'))
    THEN NULL ELSE 'migration:0130' END,
  CASE
    WHEN NULLIF(COALESCE(NULLIF(p.provider_transaction_id,''),CASE WHEN p.method='flutterwave' THEN pr.evidence_reference END),'') IS NOT NULL
      AND p.status IN ('successful','verified') AND pr.status IN ('successful','verified')
      AND COALESCE(current_net.amount_minor,0) >= GREATEST(0,sale.amount_minor-calc.provider_fee_minor-calc.lunavo_fee_minor)
      AND calc.provider_fee_minor >= GREATEST(0,COALESCE(-provider_fee.amount_minor,0))
      AND calc.lunavo_fee_minor >= GREATEST(0,COALESCE(-lunavo_fee.amount_minor,0))
      AND NOT EXISTS (SELECT 1 FROM payment_reconciliation_exceptions e WHERE e.payment_intent_id=p.id
                      AND e.resolved_at IS NULL AND e.status NOT IN ('resolved','closed','dismissed'))
    THEN NULL ELSE now() END,
  TRUE
FROM payment_intents p
JOIN orders o ON o.id=p.order_id AND o.merchant_id=p.merchant_id
JOIN LATERAL (
  SELECT id,intent_id,status,evidence_reference
  FROM payment_records WHERE intent_id=p.id ORDER BY id DESC LIMIT 1
) pr ON TRUE
JOIN ledger_entries sale ON sale.reference_key='payment:' || p.id::text AND sale.entry_type='sale' AND sale.amount_minor>0
LEFT JOIN ledger_entries provider_fee ON provider_fee.reference_key='payment:' || p.id::text || ':provider-fee' AND provider_fee.entry_type='fee'
LEFT JOIN ledger_entries lunavo_fee ON lunavo_fee.reference_key='payment:' || p.id::text || ':ts-fee' AND lunavo_fee.entry_type='fee'
LEFT JOIN LATERAL (
  SELECT SUM(amount_minor)::bigint AS amount_minor FROM ledger_entries
  WHERE reference_key='payment:' || p.id::text OR reference_key LIKE 'payment:' || p.id::text || ':%'
) current_net ON TRUE
CROSS JOIN LATERAL (
  SELECT
    GREATEST(0,COALESCE(-provider_fee.amount_minor,
      ROUND(COALESCE(p.provider_fee_minor,0)::numeric * sale.amount_minor / NULLIF(p.amount_minor,0))::bigint,0))::bigint AS provider_fee_minor,
    GREATEST(0,COALESCE(-lunavo_fee.amount_minor,p.ts_commerce_fee_minor,
      FLOOR(sale.amount_minor::numeric/100 + 0.5)::bigint))::bigint AS lunavo_fee_minor
) calc
WHERE p.status NOT IN ('failed','cancelled','expired') AND p.order_id IS NOT NULL
  AND sale.merchant_id=p.merchant_id
  AND NOT EXISTS (SELECT 1 FROM merchant_fund_release_reviews r WHERE r.source_reference='payment:' || p.id::text)
ON CONFLICT (source_reference) DO NOTHING;

-- Historical online invoice checkout payments.
INSERT INTO merchant_fund_release_reviews (
  merchant_id,source_type,source_reference,payment_intent_id,order_id,invoice_id,payment_record_id,
  provider,provider_transaction_id,provider_reference,provider_amount_minor,provider_currency,
  provider_fee_evidence_minor,amount_minor,currency,provider_fee_minor,lunavo_fee_minor,merchant_net_minor,
  held_amount_minor,legacy_provider_fee_posted_minor,legacy_lunavo_fee_posted_minor,
  status,review_note,reviewed_by,reviewed_at,legacy_hold
)
SELECT
  p.merchant_id,'invoice_payment','invoice-flutterwave:' || p.id::text,p.id,sale.order_id,sale.invoice_id,sale.payment_record_id,
  CASE WHEN NULLIF(COALESCE(NULLIF(p.provider_transaction_id,''),CASE WHEN p.method='flutterwave' THEN pr.evidence_reference END),'') IS NOT NULL
       THEN 'flutterwave' ELSE 'manual_evidence' END,
  COALESCE(NULLIF(p.provider_transaction_id,''),CASE WHEN p.method='flutterwave' THEN NULLIF(pr.evidence_reference,'') END,'MANUAL-INVOICE-ONLINE:' || p.id::text),
  NULL,p.amount_minor,upper(p.currency),p.provider_fee_minor,
  sale.amount_minor,upper(sale.currency),calc.provider_fee_minor,calc.lunavo_fee_minor,
  GREATEST(0,sale.amount_minor-calc.provider_fee_minor-calc.lunavo_fee_minor),
  GREATEST(0,COALESCE(current_net.amount_minor,0)),
  GREATEST(0,COALESCE(-provider_fee.amount_minor,0)),
  GREATEST(0,COALESCE(-lunavo_fee.amount_minor,0)),
  CASE
    WHEN NULLIF(COALESCE(NULLIF(p.provider_transaction_id,''),CASE WHEN p.method='flutterwave' THEN pr.evidence_reference END),'') IS NOT NULL
      AND p.status IN ('successful','verified') AND pr.status IN ('successful','verified')
      AND COALESCE(current_net.amount_minor,0) >= GREATEST(0,sale.amount_minor-calc.provider_fee_minor-calc.lunavo_fee_minor)
      AND calc.provider_fee_minor >= GREATEST(0,COALESCE(-provider_fee.amount_minor,0))
      AND calc.lunavo_fee_minor >= GREATEST(0,COALESCE(-lunavo_fee.amount_minor,0))
      AND NOT EXISTS (SELECT 1 FROM payment_reconciliation_exceptions e WHERE e.payment_intent_id=p.id
                      AND e.resolved_at IS NULL AND e.status NOT IN ('resolved','closed','dismissed'))
    THEN 'pending' ELSE 'reconciliation_required'
  END,
  CASE
    WHEN NULLIF(COALESCE(NULLIF(p.provider_transaction_id,''),CASE WHEN p.method='flutterwave' THEN pr.evidence_reference END),'') IS NULL
      THEN 'Legacy invoice payment is missing provider transaction evidence'
    WHEN EXISTS (SELECT 1 FROM payment_reconciliation_exceptions e WHERE e.payment_intent_id=p.id
                 AND e.resolved_at IS NULL AND e.status NOT IN ('resolved','closed','dismissed'))
      THEN 'Legacy invoice payment has an unresolved reconciliation exception'
    WHEN COALESCE(current_net.amount_minor,0) < GREATEST(0,sale.amount_minor-calc.provider_fee_minor-calc.lunavo_fee_minor)
      THEN 'Historical invoice ledger net is below expected merchant proceeds; Finance reconciliation required'
    ELSE 'Historical invoice payment may require fee reconciliation'
  END,
  'migration:0130',now(),TRUE
FROM payment_intents p
JOIN LATERAL (SELECT id,intent_id,status,evidence_reference FROM payment_records
              WHERE intent_id=p.id ORDER BY id DESC LIMIT 1) pr ON TRUE
JOIN ledger_entries sale ON sale.reference_key='invoice-flutterwave:' || p.id::text
  AND sale.entry_type='sale' AND sale.amount_minor>0 AND sale.invoice_id IS NOT NULL
LEFT JOIN ledger_entries provider_fee ON provider_fee.reference_key='invoice-flutterwave:' || p.id::text || ':provider-fee' AND provider_fee.entry_type='fee'
LEFT JOIN ledger_entries lunavo_fee ON lunavo_fee.reference_key='invoice-flutterwave:' || p.id::text || ':ts-fee' AND lunavo_fee.entry_type='fee'
LEFT JOIN LATERAL (
  SELECT SUM(amount_minor)::bigint AS amount_minor FROM ledger_entries
  WHERE reference_key='invoice-flutterwave:' || p.id::text OR reference_key LIKE 'invoice-flutterwave:' || p.id::text || ':%'
) current_net ON TRUE
CROSS JOIN LATERAL (
  SELECT
    GREATEST(0,COALESCE(-provider_fee.amount_minor,
      ROUND(COALESCE(p.provider_fee_minor,0)::numeric * sale.amount_minor / NULLIF(p.amount_minor,0))::bigint,0))::bigint AS provider_fee_minor,
    GREATEST(0,COALESCE(-lunavo_fee.amount_minor,
      FLOOR(sale.amount_minor::numeric/100 + 0.5)::bigint))::bigint AS lunavo_fee_minor
) calc
WHERE p.status NOT IN ('failed','cancelled','expired')
  AND NOT EXISTS (SELECT 1 FROM merchant_fund_release_reviews r WHERE r.source_reference='invoice-flutterwave:' || p.id::text)
ON CONFLICT (source_reference) DO NOTHING;

-- Historical merchant-approved invoice receipt references are not provider-verified.
-- Freeze them in reconciliation until Master Admin independently confirms external funds.
INSERT INTO merchant_fund_release_reviews (
  merchant_id,source_type,source_reference,payment_intent_id,order_id,invoice_id,payment_record_id,
  provider,provider_transaction_id,provider_reference,provider_amount_minor,provider_currency,
  provider_fee_evidence_minor,amount_minor,currency,provider_fee_minor,lunavo_fee_minor,merchant_net_minor,
  held_amount_minor,legacy_provider_fee_posted_minor,legacy_lunavo_fee_posted_minor,
  status,review_note,reviewed_by,reviewed_at,legacy_hold
)
SELECT
  p.merchant_id,'invoice_payment','invoice-payment:' || s.id::text,p.id,sale.order_id,sale.invoice_id,pr.id,
  'manual_evidence','MANUAL-INVOICE-SUBMISSION:' || s.id::text,s.payment_reference,
  p.amount_minor,upper(p.currency),NULL,sale.amount_minor,upper(sale.currency),
  calc.provider_fee_minor,calc.lunavo_fee_minor,
  GREATEST(0,sale.amount_minor-calc.provider_fee_minor-calc.lunavo_fee_minor),
  GREATEST(0,COALESCE(current_net.amount_minor,0)),
  GREATEST(0,COALESCE(-provider_fee.amount_minor,0)),
  GREATEST(0,COALESCE(-lunavo_fee.amount_minor,0)),
  'reconciliation_required',
  'Manual invoice receipt: Master Admin must independently confirm external funds before proceeds can be released.',
  'migration:0130',now(),TRUE
FROM invoice_payment_submissions s
JOIN payment_intents p ON p.invoice_payment_submission_id=s.id
JOIN payment_records pr ON pr.intent_id=p.id
JOIN ledger_entries sale ON sale.reference_key='invoice-payment:' || s.id::text
  AND sale.entry_type='sale' AND sale.amount_minor>0 AND sale.invoice_id IS NOT NULL
LEFT JOIN ledger_entries provider_fee ON provider_fee.reference_key='invoice-payment:' || s.id::text || ':provider-fee' AND provider_fee.entry_type='fee'
LEFT JOIN ledger_entries lunavo_fee ON lunavo_fee.reference_key='invoice-payment:' || s.id::text || ':ts-fee' AND lunavo_fee.entry_type='fee'
LEFT JOIN LATERAL (
  SELECT SUM(amount_minor)::bigint AS amount_minor FROM ledger_entries
  WHERE reference_key='invoice-payment:' || s.id::text OR reference_key LIKE 'invoice-payment:' || s.id::text || ':%'
) current_net ON TRUE
CROSS JOIN LATERAL (
  SELECT GREATEST(0,COALESCE(-provider_fee.amount_minor,0))::bigint AS provider_fee_minor,
         GREATEST(0,COALESCE(-lunavo_fee.amount_minor,FLOOR(sale.amount_minor::numeric/100 + 0.5)::bigint))::bigint AS lunavo_fee_minor
) calc
WHERE s.status='verified'
  AND NOT EXISTS (SELECT 1 FROM merchant_fund_release_reviews r WHERE r.source_reference='invoice-payment:' || s.id::text)
ON CONFLICT (source_reference) DO NOTHING;

-- Historical store auctions; provider IDs are rechecked later and legacy ledger
-- fee rows are retained so the release action does not duplicate posted fees.
INSERT INTO merchant_fund_release_reviews (
  merchant_id,source_type,source_reference,payment_intent_id,order_id,invoice_id,payment_record_id,
  provider,provider_transaction_id,provider_reference,provider_amount_minor,provider_currency,
  provider_fee_evidence_minor,amount_minor,currency,provider_fee_minor,lunavo_fee_minor,merchant_net_minor,
  held_amount_minor,legacy_provider_fee_posted_minor,legacy_lunavo_fee_posted_minor,
  status,review_note,reviewed_by,reviewed_at,legacy_hold
)
SELECT
  a.seller_merchant_id,'store_auction',sale.reference_key,NULL,NULL,NULL,NULL,
  'flutterwave',v.provider_reference,NULL,sale.amount_minor,upper(sale.currency),
  GREATEST(0,COALESCE(-provider_fee.amount_minor,0)),
  sale.amount_minor,upper(sale.currency),
  GREATEST(0,COALESCE(-provider_fee.amount_minor,0)),
  GREATEST(0,COALESCE(-lunavo_fee.amount_minor,FLOOR(sale.amount_minor::numeric/100 + 0.5)::bigint)),
  GREATEST(0,sale.amount_minor-GREATEST(0,COALESCE(-provider_fee.amount_minor,0))
    -GREATEST(0,COALESCE(-lunavo_fee.amount_minor,FLOOR(sale.amount_minor::numeric/100 + 0.5)::bigint))),
  GREATEST(0,sale.amount_minor+COALESCE(provider_fee.amount_minor,0)+COALESCE(lunavo_fee.amount_minor,0)),
  GREATEST(0,COALESCE(-provider_fee.amount_minor,0)),
  GREATEST(0,COALESCE(-lunavo_fee.amount_minor,0)),
  CASE WHEN GREATEST(0,sale.amount_minor+COALESCE(provider_fee.amount_minor,0)+COALESCE(lunavo_fee.amount_minor,0))
      >= GREATEST(0,sale.amount_minor-GREATEST(0,COALESCE(-provider_fee.amount_minor,0))
        -GREATEST(0,COALESCE(-lunavo_fee.amount_minor,FLOOR(sale.amount_minor::numeric/100 + 0.5)::bigint)))
    THEN 'pending' ELSE 'reconciliation_required' END,
  CASE WHEN GREATEST(0,sale.amount_minor+COALESCE(provider_fee.amount_minor,0)+COALESCE(lunavo_fee.amount_minor,0))
      < GREATEST(0,sale.amount_minor-GREATEST(0,COALESCE(-provider_fee.amount_minor,0))
        -GREATEST(0,COALESCE(-lunavo_fee.amount_minor,FLOOR(sale.amount_minor::numeric/100 + 0.5)::bigint)))
    THEN 'Historical store auction net is below expected proceeds; Finance reconciliation required' ELSE NULL END,
  CASE WHEN GREATEST(0,sale.amount_minor+COALESCE(provider_fee.amount_minor,0)+COALESCE(lunavo_fee.amount_minor,0))
      >= GREATEST(0,sale.amount_minor-GREATEST(0,COALESCE(-provider_fee.amount_minor,0))
        -GREATEST(0,COALESCE(-lunavo_fee.amount_minor,FLOOR(sale.amount_minor::numeric/100 + 0.5)::bigint)))
    THEN NULL ELSE 'migration:0130' END,
  CASE WHEN GREATEST(0,sale.amount_minor+COALESCE(provider_fee.amount_minor,0)+COALESCE(lunavo_fee.amount_minor,0))
      >= GREATEST(0,sale.amount_minor-GREATEST(0,COALESCE(-provider_fee.amount_minor,0))
        -GREATEST(0,COALESCE(-lunavo_fee.amount_minor,FLOOR(sale.amount_minor::numeric/100 + 0.5)::bigint)))
    THEN NULL ELSE now() END,
  TRUE
FROM store_auction_listings a
JOIN store_auction_bids b ON b.id=a.winning_bid_id AND b.auction_id=a.id AND b.risk_status='accepted'
JOIN store_auction_payment_verifications v ON v.auction_id=a.id AND v.bid_id=b.id
  AND v.provider='flutterwave' AND v.status='verified'
JOIN ledger_entries sale ON sale.reference_key='store-auction-sale:' || a.id::text || ':' || b.id::text
  AND sale.entry_type='sale' AND sale.amount_minor>0
LEFT JOIN ledger_entries provider_fee ON provider_fee.reference_key='store-auction-provider-fee:' || a.id::text || ':' || b.id::text AND provider_fee.entry_type='fee'
LEFT JOIN ledger_entries lunavo_fee ON lunavo_fee.reference_key='store-auction-lunavo-fee:' || a.id::text || ':' || b.id::text AND lunavo_fee.entry_type='fee'
WHERE a.status='transferred' AND a.payment_status='verified' AND sale.merchant_id=a.seller_merchant_id
  AND NOT EXISTS (SELECT 1 FROM merchant_fund_release_reviews r WHERE r.source_reference=sale.reference_key)
ON CONFLICT (source_reference) DO NOTHING;

-- Historical product auctions.
INSERT INTO merchant_fund_release_reviews (
  merchant_id,source_type,source_reference,payment_intent_id,order_id,invoice_id,payment_record_id,
  provider,provider_transaction_id,provider_reference,provider_amount_minor,provider_currency,
  provider_fee_evidence_minor,amount_minor,currency,provider_fee_minor,lunavo_fee_minor,merchant_net_minor,
  held_amount_minor,legacy_provider_fee_posted_minor,legacy_lunavo_fee_posted_minor,
  status,review_note,reviewed_by,reviewed_at,legacy_hold
)
SELECT
  a.merchant_id,'product_auction','product-auction:' || settle.auction_id::text || ':' || settle.bid_id::text,NULL,NULL,NULL,NULL,
  'flutterwave',settle.provider_transaction_id,settle.tx_ref,sale.amount_minor,upper(sale.currency),
  GREATEST(0,COALESCE(-provider_fee.amount_minor,0)),
  sale.amount_minor,upper(sale.currency),
  GREATEST(0,COALESCE(-provider_fee.amount_minor,0)),
  GREATEST(0,COALESCE(-lunavo_fee.amount_minor,FLOOR(sale.amount_minor::numeric/100 + 0.5)::bigint)),
  GREATEST(0,sale.amount_minor-GREATEST(0,COALESCE(-provider_fee.amount_minor,0))
    -GREATEST(0,COALESCE(-lunavo_fee.amount_minor,FLOOR(sale.amount_minor::numeric/100 + 0.5)::bigint))),
  GREATEST(0,sale.amount_minor+COALESCE(provider_fee.amount_minor,0)+COALESCE(lunavo_fee.amount_minor,0)),
  GREATEST(0,COALESCE(-provider_fee.amount_minor,0)),
  GREATEST(0,COALESCE(-lunavo_fee.amount_minor,0)),
  CASE WHEN GREATEST(0,sale.amount_minor+COALESCE(provider_fee.amount_minor,0)+COALESCE(lunavo_fee.amount_minor,0))
      >= GREATEST(0,sale.amount_minor-GREATEST(0,COALESCE(-provider_fee.amount_minor,0))
        -GREATEST(0,COALESCE(-lunavo_fee.amount_minor,FLOOR(sale.amount_minor::numeric/100 + 0.5)::bigint)))
    THEN 'pending' ELSE 'reconciliation_required' END,
  CASE WHEN GREATEST(0,sale.amount_minor+COALESCE(provider_fee.amount_minor,0)+COALESCE(lunavo_fee.amount_minor,0))
      < GREATEST(0,sale.amount_minor-GREATEST(0,COALESCE(-provider_fee.amount_minor,0))
        -GREATEST(0,COALESCE(-lunavo_fee.amount_minor,FLOOR(sale.amount_minor::numeric/100 + 0.5)::bigint)))
    THEN 'Historical product auction net is below expected proceeds; Finance reconciliation required' ELSE NULL END,
  CASE WHEN GREATEST(0,sale.amount_minor+COALESCE(provider_fee.amount_minor,0)+COALESCE(lunavo_fee.amount_minor,0))
      >= GREATEST(0,sale.amount_minor-GREATEST(0,COALESCE(-provider_fee.amount_minor,0))
        -GREATEST(0,COALESCE(-lunavo_fee.amount_minor,FLOOR(sale.amount_minor::numeric/100 + 0.5)::bigint)))
    THEN NULL ELSE 'migration:0130' END,
  CASE WHEN GREATEST(0,sale.amount_minor+COALESCE(provider_fee.amount_minor,0)+COALESCE(lunavo_fee.amount_minor,0))
      >= GREATEST(0,sale.amount_minor-GREATEST(0,COALESCE(-provider_fee.amount_minor,0))
        -GREATEST(0,COALESCE(-lunavo_fee.amount_minor,FLOOR(sale.amount_minor::numeric/100 + 0.5)::bigint)))
    THEN NULL ELSE now() END,
  TRUE
FROM product_auction_settlements settle
JOIN auction_listings a ON a.id=settle.auction_id
JOIN ledger_entries sale ON sale.reference_key='product-auction:' || settle.auction_id::text || ':' || settle.bid_id::text || ':sale'
  AND sale.entry_type='sale' AND sale.amount_minor>0
LEFT JOIN ledger_entries provider_fee ON provider_fee.reference_key='product-auction:' || settle.auction_id::text || ':' || settle.bid_id::text || ':provider-fee' AND provider_fee.entry_type='fee'
LEFT JOIN ledger_entries lunavo_fee ON lunavo_fee.reference_key='product-auction:' || settle.auction_id::text || ':' || settle.bid_id::text || ':lunavo-fee' AND lunavo_fee.entry_type='fee'
WHERE settle.status='paid' AND settle.provider_transaction_id IS NOT NULL AND sale.merchant_id=a.merchant_id
  AND NOT EXISTS (SELECT 1 FROM merchant_fund_release_reviews r
                  WHERE r.source_reference='product-auction:' || settle.auction_id::text || ':' || settle.bid_id::text)
ON CONFLICT (source_reference) DO NOTHING;

-- Freeze the exact legacy ledger contribution, not the theoretical net, so that
-- older missing fee rows cannot leave an already-credited balance spendable.
INSERT INTO ledger_entries (
  merchant_id,order_id,invoice_id,payment_record_id,amount_minor,currency,entry_type,reference_key
)
SELECT r.merchant_id,r.order_id,r.invoice_id,r.payment_record_id,-r.held_amount_minor,r.currency,
       'merchant_funds_hold','merchant-fund-release:legacy-hold:' || r.source_reference
FROM merchant_fund_release_reviews r
WHERE r.legacy_hold=TRUE
  AND r.status IN ('pending','reconciliation_required')
  AND r.held_amount_minor>0
ON CONFLICT (reference_key) DO NOTHING;
