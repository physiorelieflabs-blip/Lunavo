CREATE OR REPLACE FUNCTION lunavo_guard_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ledger_entries_immutable_guard ON ledger_entries;
CREATE TRIGGER ledger_entries_immutable_guard
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION lunavo_guard_ledger_mutation();
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ledger_entries_dashboard_projection ON ledger_entries;
CREATE TRIGGER ledger_entries_dashboard_projection
AFTER INSERT ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION lunavo_project_ledger_to_dashboard();

CREATE OR REPLACE FUNCTION lunavo_revoke_previous_store_owner_access()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.merchant_id IS DISTINCT FROM NEW.merchant_id THEN
    INSERT INTO store_ownership_access_revocations
      (storefront_id, revoked_merchant_id, reason)
    VALUES
      (NEW.id, OLD.merchant_id, 'Store ownership changed; previous owner immediately loses owner-level store access');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS merchant_storefront_owner_access_revocation ON merchant_storefronts;
CREATE TRIGGER merchant_storefront_owner_access_revocation
AFTER UPDATE OF merchant_id ON merchant_storefronts
FOR EACH ROW EXECUTE FUNCTION lunavo_revoke_previous_store_owner_access();

CREATE OR REPLACE FUNCTION lunavo_sanitize_store_auction_metrics()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  merchant_currency text;
BEGIN
  NEW.growth_percent := NULL;
  NEW.traffic_count := NULL;
  NEW.conversion_percent := NULL;
  NEW.expenses_minor := NULL;
  NEW.valuation_indicator_minor := NULL;
  SELECT m.currency INTO merchant_currency
  FROM store_auction_listings a
  JOIN merchants m ON m.id = a.seller_merchant_id
  WHERE a.id = NEW.auction_id;
  IF merchant_currency IS NULL OR upper(merchant_currency) <> upper(NEW.currency) THEN
    NEW.revenue_minor := NULL;
    NEW.verified_profit_minor := NULL;
    NEW.aov_minor := NULL;
    NEW.ad_spend_minor := NULL;
    NEW.ad_revenue_minor := NULL;
  END IF;
  IF upper(NEW.currency) <> 'USD' THEN
    NEW.verified_profit_minor := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DO $
BEGIN
  IF to_regclass('public.store_auction_metric_snapshots') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS lunavo_sanitize_store_auction_metrics_trigger ON store_auction_metric_snapshots;
    CREATE TRIGGER lunavo_sanitize_store_auction_metrics_trigger
    BEFORE INSERT OR UPDATE ON store_auction_metric_snapshots
    FOR EACH ROW EXECUTE FUNCTION lunavo_sanitize_store_auction_metrics();
  END IF;
END;
$;
