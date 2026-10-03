-- Strengthen the single TS Pay transaction control plane.
-- Every dashboard-visible financial event must carry a canonical transaction
-- kind and verification state; this remains a projection, not a bank balance.
ALTER TABLE lunavo_dashboard_transactions
  ADD COLUMN IF NOT EXISTS transaction_kind TEXT,
  ADD COLUMN IF NOT EXISTS verification_state TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

UPDATE lunavo_dashboard_transactions
SET transaction_kind = CASE
  WHEN transaction_type ILIKE '%auction%' THEN 'auction_acquisition'
  WHEN transaction_type ILIKE '%subscription%' THEN 'subscription'
  WHEN transaction_type ILIKE '%refund%' THEN 'refund'
  WHEN transaction_type ILIKE '%withdrawal%' THEN 'withdrawal'
  WHEN transaction_type ILIKE '%transfer%' THEN 'internal_transfer'
  ELSE 'sale'
END
WHERE transaction_kind IS NULL;

ALTER TABLE lunavo_dashboard_transactions
  ALTER COLUMN transaction_kind SET NOT NULL;

ALTER TABLE lunavo_dashboard_transactions
  ADD CONSTRAINT lunavo_dashboard_transaction_kind_check
  CHECK (transaction_kind IN ('sale','auction_acquisition','subscription','refund','withdrawal','internal_transfer'));

ALTER TABLE lunavo_dashboard_transactions
  ADD CONSTRAINT lunavo_dashboard_verification_state_check
  CHECK (verification_state IN ('unverified','verified','reversed','reconciliation_required'));

CREATE INDEX IF NOT EXISTS lunavo_dashboard_transactions_kind_idx
  ON lunavo_dashboard_transactions (merchant_id, transaction_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS lunavo_dashboard_transactions_provider_idx
  ON lunavo_dashboard_transactions (provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

-- Ledger projection is authoritative for the dashboard. A ledger entry is
-- already a server-side accounting fact, so it is verified unless it is an
-- explicit reversal/adjustment requiring reconciliation.
CREATE OR REPLACE FUNCTION lunavo_project_ledger_to_dashboard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  signed_amount bigint := NEW.amount_minor;
  kind text := CASE
    WHEN NEW.entry_type LIKE 'withdrawal_%' THEN 'withdrawal'
    WHEN NEW.entry_type = 'refund' THEN 'refund'
    WHEN NEW.entry_type = 'fee' THEN 'sale'
    ELSE 'sale'
  END;
  verification text := CASE
    WHEN NEW.entry_type = 'adjustment' THEN 'reconciliation_required'
    ELSE 'verified'
  END;
BEGIN
  INSERT INTO lunavo_dashboard_transactions (
    merchant_id, transaction_type, transaction_kind, status,
    amount_minor, currency, lunavo_fee_minor, provider_fee_minor,
    merchant_net_minor, internal_reference, idempotency_key, source,
    verification_state, verified_at, metadata
  ) VALUES (
    NEW.merchant_id,
    'ledger_' || NEW.entry_type,
    kind,
    CASE WHEN NEW.entry_type = 'adjustment' THEN 'reconciliation_required' ELSE 'confirmed' END,
    ABS(signed_amount), NEW.currency,
    CASE WHEN NEW.entry_type = 'fee' THEN ABS(signed_amount) ELSE 0 END,
    0, signed_amount,
    'LEDGER-' || NEW.id,
    'ledger:' || NEW.id,
    'ts_pay_ledger_projection',
    verification,
    CASE WHEN verification = 'verified' THEN now() ELSE NULL END,
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

DROP TRIGGER IF EXISTS ledger_entries_dashboard_projection ON ledger_entries;
CREATE TRIGGER ledger_entries_dashboard_projection
AFTER INSERT ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION lunavo_project_ledger_to_dashboard();
