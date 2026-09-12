-- The dashboard is a read model of the authoritative TS Pay ledger.
-- This trigger means new sale/fee/refund/withdrawal ledger activity cannot
-- bypass the merchant dashboard.
CREATE OR REPLACE FUNCTION lunavo_project_ledger_to_dashboard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  signed_amount bigint := NEW.amount_minor;
  transaction_status text := CASE WHEN NEW.entry_type IN ('refund','withdrawal_paid') THEN 'confirmed' ELSE 'confirmed' END;
BEGIN
  INSERT INTO lunavo_dashboard_transactions (
    merchant_id, transaction_type, status, amount_minor, currency,
    lunavo_fee_minor, provider_fee_minor, merchant_net_minor,
    internal_reference, idempotency_key, source, metadata
  ) VALUES (
    NEW.merchant_id,
    'ledger_' || NEW.entry_type,
    transaction_status,
    ABS(signed_amount),
    NEW.currency,
    CASE WHEN NEW.entry_type = 'fee' THEN ABS(signed_amount) ELSE 0 END,
    0,
    signed_amount,
    'LEDGER-' || NEW.id,
    'ledger:' || NEW.id,
    'ts_pay_ledger_projection',
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

CREATE INDEX IF NOT EXISTS lunavo_dashboard_transactions_type_idx
  ON lunavo_dashboard_transactions (merchant_id, transaction_type, created_at DESC);
