ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_entry_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_entry_type_check
  CHECK (entry_type IN (
    'sale',
    'fee',
    'refund',
    'withdrawal_reserve',
    'withdrawal_release',
    'withdrawal_paid',
    'supplier_payment',
    'adjustment',
    'internal_transfer_in',
    'internal_transfer_out'
  ));

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_link_id INTEGER REFERENCES payment_links(id);

CREATE INDEX IF NOT EXISTS orders_payment_link_idx ON orders (payment_link_id);