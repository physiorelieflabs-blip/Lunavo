ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS supplier_payment_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS supplier_payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS supplier_payment_amount_minor INTEGER,
  ADD COLUMN IF NOT EXISTS supplier_paid_at TIMESTAMPTZ;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_supplier_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_supplier_payment_status_check
  CHECK (supplier_payment_status IN ('unpaid', 'paid', 'failed'));

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_entry_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_entry_type_check
  CHECK (entry_type IN ('sale','fee','refund','withdrawal_reserve','withdrawal_release','withdrawal_paid','supplier_payment','adjustment'));