-- TS Pay internal merchant-to-merchant transfers must remain in the authoritative ledger.
-- These entries are never provider settlements and never represent an external bank account.
ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_entry_type_check;

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_entry_type_check
  CHECK (entry_type IN (
    'sale',
    'fee',
    'refund',
    'withdrawal_reserve',
    'withdrawal_release',
    'withdrawal_paid',
    'adjustment',
    'internal_transfer_out',
    'internal_transfer_in'
  ));

CREATE INDEX IF NOT EXISTS ledger_entries_internal_transfer_idx
  ON ledger_entries (merchant_id, currency, created_at)
  WHERE entry_type IN ('internal_transfer_out', 'internal_transfer_in');
