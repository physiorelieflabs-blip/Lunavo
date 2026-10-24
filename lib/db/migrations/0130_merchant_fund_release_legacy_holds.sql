-- Keep pre-deployment merchant proceeds behind the same release gate.
-- Historical immutable sale/fee rows are preserved. A matching negative hold
-- row freezes their current net balance; Master Admin release adds the equal
-- and opposite release marker instead of posting a duplicate sale.
ALTER TABLE merchant_fund_release_reviews
  ADD COLUMN IF NOT EXISTS legacy_hold BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE merchant_fund_release_reviews
  DROP CONSTRAINT IF EXISTS merchant_fund_release_net_math;
ALTER TABLE merchant_fund_release_reviews
  ADD CONSTRAINT merchant_fund_release_net_math
  CHECK (legacy_hold OR merchant_net_minor = amount_minor - provider_fee_minor - lunavo_fee_minor);

-- Include the newly-added legacy_hold flag in immutable source protection.
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
     OR NEW.payment_record_id IS DISTINCT FROM OLD.payment_record_id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id
     OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
     OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.provider_fee_minor IS DISTINCT FROM OLD.provider_fee_minor
     OR NEW.lunavo_fee_minor IS DISTINCT FROM OLD.lunavo_fee_minor
     OR NEW.merchant_net_minor IS DISTINCT FROM OLD.merchant_net_minor
     OR NEW.legacy_hold IS DISTINCT FROM OLD.legacy_hold
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Merchant fund-release source and amount are immutable';
  END IF;

  -- A quarantined row may be re-opened only to pending after the API has
  -- re-verified the external provider and internal evidence; audit logs keep
  -- the prior reviewer/decision because the pending state has no reviewer.
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

-- Historical order checkouts whose sale credit already exists.
INSERT INTO merchant_fund_release_reviews (
  merchant_id,source_type,source_reference,payment_intent_id,order_id,payment_record_id,
  provider,provider_transaction_id,provider_reference,amount_minor,currency,
  provider_fee_minor,lunavo_fee_minor,merchant_net_minor,status,review_note,reviewed_by,reviewed_at,legacy_hold
)
SELECT
  p.merchant_id,
  'order_payment',
  'payment:' || p.id::text,
  p.id,
  p.order_id,
  pr.id,
  'flutterwave',
  COALESCE(NULLIF(p.provider_transaction_id,''),'LEGACY-MISSING-ID:' || p.id::text),
  NULL,
  sale.amount_minor,
  upper(sale.currency),
  GREATEST(0,COALESCE(-provider_fee.amount_minor,COALESCE(p.provider_fee_minor,0))),
  GREATEST(0,COALESCE(-lunavo_fee.amount_minor,COALESCE(p.ts_commerce_fee_minor,floor(sale.amount_minor::numeric/100 + 0.5)::bigint))),
  GREATEST(0,COALESCE(current_net.amount_minor,0)),
  CASE
    WHEN p.status='successful' AND pr.status='successful' AND NULLIF(p.provider_transaction_id,'') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM payment_reconciliation_exceptions e
      WHERE e.payment_intent_id=p.id AND e.resolved_at IS NULL
        AND e.status NOT IN ('resolved','closed','dismissed')
    ) THEN 'pending'
    ELSE 'reconciliation_required'
  END,
  CASE
    WHEN NULLIF(p.provider_transaction_id,'') IS NULL THEN 'Legacy sale is missing provider transaction evidence'
    WHEN EXISTS (
      SELECT 1 FROM payment_reconciliation_exceptions e
      WHERE e.payment_intent_id=p.id AND e.resolved_at IS NULL
        AND e.status NOT IN ('resolved','closed','dismissed')
    ) THEN 'Legacy sale has an unresolved provider reconciliation exception'
    WHEN p.status <> 'successful' OR pr.status <> 'successful' THEN 'Legacy payment state requires Finance reconciliation'
    ELSE NULL
  END,
  CASE WHEN p.status='successful' AND pr.status='successful' AND NULLIF(p.provider_transaction_id,'') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM payment_reconciliation_exceptions e
      WHERE e.payment_intent_id=p.id AND e.resolved_at IS NULL
        AND e.status NOT IN ('resolved','closed','dismissed')
    ) THEN NULL ELSE 'migration:0130' END,
  CASE WHEN p.status='successful' AND pr.status='successful' AND NULLIF(p.provider_transaction_id,'') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM payment_reconciliation_exceptions e
      WHERE e.payment_intent_id=p.id AND e.resolved_at IS NULL
        AND e.status NOT IN ('resolved','closed','dismissed')
    ) THEN NULL ELSE now() END,
  TRUE
FROM payment_intents p
JOIN orders o ON o.id=p.order_id AND o.merchant_id=p.merchant_id
JOIN LATERAL (
  SELECT id,intent_id,status
  FROM payment_records
  WHERE intent_id=p.id
  ORDER BY id DESC
  LIMIT 1
) pr ON TRUE
JOIN ledger_entries sale ON sale.reference_key='payment:' || p.id::text AND sale.entry_type='sale' AND sale.amount_minor>0
LEFT JOIN ledger_entries provider_fee ON provider_fee.reference_key='payment:' || p.id::text || ':provider-fee' AND provider_fee.entry_type='fee'
LEFT JOIN ledger_entries lunavo_fee ON lunavo_fee.reference_key='payment:' || p.id::text || ':ts-fee' AND lunavo_fee.entry_type='fee'
LEFT JOIN LATERAL (
  SELECT SUM(amount_minor)::bigint AS amount_minor
  FROM ledger_entries
  WHERE reference_key='payment:' || p.id::text OR reference_key LIKE 'payment:' || p.id::text || ':%'
) current_net ON TRUE
WHERE p.status NOT IN ('failed','cancelled','expired')
  AND p.order_id IS NOT NULL
  AND sale.merchant_id=p.merchant_id
  AND NOT EXISTS (
    SELECT 1 FROM merchant_fund_release_reviews r WHERE r.source_reference='payment:' || p.id::text
  )
ON CONFLICT (source_reference) DO NOTHING;

-- Historical store auctions. Existing sale/fee lines are preserved and frozen
-- by their outstanding net amount; no second sale is created on release.
INSERT INTO merchant_fund_release_reviews (
  merchant_id,source_type,source_reference,provider,provider_transaction_id,provider_reference,
  amount_minor,currency,provider_fee_minor,lunavo_fee_minor,merchant_net_minor,status,
  review_note,reviewed_by,reviewed_at,legacy_hold
)
SELECT
  a.seller_merchant_id,
  'store_auction',
  sale.reference_key,
  'flutterwave',
  v.provider_reference,
  a.payment_reference,
  sale.amount_minor,
  upper(sale.currency),
  GREATEST(0,COALESCE(-provider_fee.amount_minor,0)),
  GREATEST(0,COALESCE(-lunavo_fee.amount_minor,0)),
  GREATEST(0,sale.amount_minor+COALESCE(provider_fee.amount_minor,0)+COALESCE(lunavo_fee.amount_minor,0)),
  'pending',NULL,NULL,NULL,TRUE
FROM store_auction_listings a
JOIN store_auction_bids b ON b.id=a.winning_bid_id AND b.auction_id=a.id AND b.risk_status='accepted'
JOIN store_auction_payment_verifications v ON v.auction_id=a.id AND v.bid_id=b.id AND v.provider='flutterwave' AND v.status='verified'
JOIN ledger_entries sale ON sale.reference_key='store-auction-sale:' || a.id::text || ':' || b.id::text AND sale.entry_type='sale'
LEFT JOIN ledger_entries provider_fee ON provider_fee.reference_key='store-auction-provider-fee:' || a.id::text || ':' || b.id::text AND provider_fee.entry_type='fee'
LEFT JOIN ledger_entries lunavo_fee ON lunavo_fee.reference_key='store-auction-lunavo-fee:' || a.id::text || ':' || b.id::text AND lunavo_fee.entry_type='fee'
WHERE a.status='transferred' AND a.payment_status='verified'
  AND sale.merchant_id=a.seller_merchant_id
  AND NOT EXISTS (SELECT 1 FROM merchant_fund_release_reviews r WHERE r.source_reference=sale.reference_key)
ON CONFLICT (source_reference) DO NOTHING;

-- Historical product auctions.
INSERT INTO merchant_fund_release_reviews (
  merchant_id,source_type,source_reference,provider,provider_transaction_id,provider_reference,
  amount_minor,currency,provider_fee_minor,lunavo_fee_minor,merchant_net_minor,status,
  review_note,reviewed_by,reviewed_at,legacy_hold
)
SELECT
  a.merchant_id,
  'product_auction',
  'product-auction:' || settle.auction_id::text || ':' || settle.bid_id::text,
  'flutterwave',
  settle.provider_transaction_id,
  settle.tx_ref,
  sale.amount_minor,
  upper(sale.currency),
  GREATEST(0,COALESCE(-provider_fee.amount_minor,0)),
  GREATEST(0,COALESCE(-lunavo_fee.amount_minor,0)),
  GREATEST(0,sale.amount_minor+COALESCE(provider_fee.amount_minor,0)+COALESCE(lunavo_fee.amount_minor,0)),
  'pending',NULL,NULL,NULL,TRUE
FROM product_auction_settlements settle
JOIN auction_listings a ON a.id=settle.auction_id
JOIN ledger_entries sale ON sale.reference_key='product-auction:' || settle.auction_id::text || ':' || settle.bid_id::text || ':sale' AND sale.entry_type='sale'
LEFT JOIN ledger_entries provider_fee ON provider_fee.reference_key='product-auction:' || settle.auction_id::text || ':' || settle.bid_id::text || ':provider-fee' AND provider_fee.entry_type='fee'
LEFT JOIN ledger_entries lunavo_fee ON lunavo_fee.reference_key='product-auction:' || settle.auction_id::text || ':' || settle.bid_id::text || ':lunavo-fee' AND lunavo_fee.entry_type='fee'
WHERE settle.status='paid' AND settle.provider_transaction_id IS NOT NULL
  AND sale.merchant_id=a.merchant_id
  AND NOT EXISTS (
    SELECT 1 FROM merchant_fund_release_reviews r
    WHERE r.source_reference='product-auction:' || settle.auction_id::text || ':' || settle.bid_id::text
  )
ON CONFLICT (source_reference) DO NOTHING;

-- Freeze all prior positive net sales, including legacy disputes that must be
-- reconciled. Negative/zero hold amounts are unnecessary and are not posted.
INSERT INTO ledger_entries (
  merchant_id,order_id,payment_record_id,amount_minor,currency,entry_type,reference_key
)
SELECT r.merchant_id,r.order_id,r.payment_record_id,-r.merchant_net_minor,r.currency,
       'merchant_funds_hold','merchant-fund-release:legacy-hold:' || r.source_reference
FROM merchant_fund_release_reviews r
WHERE r.legacy_hold=TRUE
  AND r.status IN ('pending','reconciliation_required')
  AND r.merchant_net_minor>0
ON CONFLICT (reference_key) DO NOTHING;
