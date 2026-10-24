-- Fix withdrawal accounting without rewriting immutable historical entries.
-- Paid legacy withdrawals previously had a zero-value withdrawal_paid ledger
-- marker. Add a traceable adjustment debit for those historical payouts; the
-- ledger projection deliberately flags it for Finance reconciliation.
INSERT INTO ledger_entries (
  merchant_id, withdrawal_id, amount_minor, currency, entry_type, reference_key
)
SELECT
  w.merchant_id,
  w.id,
  -ROUND(CAST(w.amount AS numeric) * 100)::bigint,
  UPPER(w.currency),
  'adjustment',
  'migration:0128:paid-withdrawal-debit:' || w.id::text
FROM withdrawals w
WHERE w.status = 'paid'
  AND CAST(w.amount AS numeric) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM ledger_entries paid
    WHERE paid.withdrawal_id = w.id
      AND paid.entry_type = 'withdrawal_paid'
      AND paid.amount_minor < 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM ledger_entries correction
    WHERE correction.reference_key = 'migration:0128:paid-withdrawal-debit:' || w.id::text
  )
ON CONFLICT (reference_key) DO NOTHING;
