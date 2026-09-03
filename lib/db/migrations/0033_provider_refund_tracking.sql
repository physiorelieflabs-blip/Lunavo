ALTER TABLE refund_records
  ADD COLUMN IF NOT EXISTS provider_refund_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_failure_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS refund_records_provider_refund_id_unique
  ON refund_records (provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;