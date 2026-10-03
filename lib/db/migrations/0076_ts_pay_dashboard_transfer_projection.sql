-- Ensure TS Pay internal transfer ledger entries project into the dashboard as
-- internal transfers rather than being misclassified as sales.
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

CREATE INDEX IF NOT EXISTS lunavo_dashboard_transactions_transfer_idx
  ON lunavo_dashboard_transactions (merchant_id, created_at DESC)
  WHERE transaction_kind = 'internal_transfer';
