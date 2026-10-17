-- 0128: inspection-backed refund requests for customer returns.
-- A return never changes money or stock by itself; provider refund + ledger remain in the existing guarded refund workflow.
ALTER TABLE customer_return_requests
  ADD COLUMN IF NOT EXISTS inspection_grade text
    CHECK (inspection_grade IS NULL OR inspection_grade IN ('resellable','damaged','unsellable'));
ALTER TABLE customer_return_requests
  ADD COLUMN IF NOT EXISTS inspection_note text
    CHECK (inspection_note IS NULL OR length(inspection_note) <= 2000);
ALTER TABLE customer_return_requests
  ADD COLUMN IF NOT EXISTS inspected_at timestamptz;
ALTER TABLE customer_return_requests
  ADD COLUMN IF NOT EXISTS refund_record_id integer REFERENCES refund_records(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customer_return_requests_refund_record_unique
  ON customer_return_requests(refund_record_id)
  WHERE refund_record_id IS NOT NULL;

-- Preserve audit detail if inventory eligibility changes between preparation and provider approval.
ALTER TABLE refund_records
  ADD COLUMN IF NOT EXISTS inventory_restock_skip_reason text
    CHECK (inventory_restock_skip_reason IS NULL OR length(inventory_restock_skip_reason) <= 1000);
