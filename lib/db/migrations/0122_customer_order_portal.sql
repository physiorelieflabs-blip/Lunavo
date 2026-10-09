-- Token-protected branded order tracking and customer return/exchange requests.
-- Return requests are review records only; they never issue refunds or restock by themselves.
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS returns_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS return_window_days integer NOT NULL DEFAULT 30;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchants_return_window_days_check'
  ) THEN
    ALTER TABLE merchants ADD CONSTRAINT merchants_return_window_days_check
      CHECK (return_window_days BETWEEN 0 AND 180);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS customer_return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('return','exchange')),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000000),
  reason text NOT NULL CHECK (reason IN (
    'damaged','wrong_item','not_as_described','arrived_late','changed_mind','size_fit','other'
  )),
  customer_message text CHECK (customer_message IS NULL OR length(customer_message) <= 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','approved','rejected','received','completed','cancelled'
  )),
  return_window_days_snapshot integer NOT NULL CHECK (return_window_days_snapshot BETWEEN 0 AND 180),
  request_fingerprint text NOT NULL,
  idempotency_key text NOT NULL,
  resolution_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(merchant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS customer_return_requests_order_status_idx
  ON customer_return_requests(merchant_id, order_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_return_requests_merchant_queue_idx
  ON customer_return_requests(merchant_id, status, created_at DESC);
