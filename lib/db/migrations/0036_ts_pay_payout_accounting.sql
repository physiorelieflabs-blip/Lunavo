-- Durable withdrawal lifecycle metadata and ledger reservations.
-- Manual is the only available payout rail until a regulated provider is connected.
ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS payout_provider TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS provider_payout_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_status TEXT,
  ADD COLUMN IF NOT EXISTS provider_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS settlement_reference TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

-- New requests always carry an idempotency key. Preserve old rows by assigning
-- deterministic keys before tightening the column.
UPDATE withdrawals
SET idempotency_key = 'legacy-withdrawal-' || id::text
WHERE idempotency_key IS NULL;

ALTER TABLE withdrawals
  ALTER COLUMN idempotency_key SET NOT NULL;

-- Backfill reservations for existing requests so paid withdrawals do not
-- remain permanently available and pending requests remain protected.
INSERT INTO ledger_entries (
  merchant_id,
  withdrawal_id,
  amount_minor,
  currency,
  entry_type,
  reference_key
)
SELECT
  w.merchant_id,
  w.id,
  -round(w.amount::numeric * 100)::integer,
  w.currency,
  'withdrawal_reserve',
  'withdrawal:' || w.id::text || ':reserve'
FROM withdrawals w
WHERE w.status IN ('pending', 'approved', 'paid')
  AND NOT EXISTS (
    SELECT 1
    FROM ledger_entries le
    WHERE le.reference_key = 'withdrawal:' || w.id::text || ':reserve'
  );

-- Replace legacy sequential TS Pay account numbers with opaque identifiers.
-- Existing account holders keep their accounts; only the public identifier
-- changes, preventing merchant IDs from being enumerable.
UPDATE ts_pay_accounts
SET account_number = 'TS' || upper(substr(md5(merchant_id::text || ':' || account_number), 1, 16))
WHERE account_number ~ '^TS[0-9]{10}$';

-- Keep a zero-value settlement event for historical paid requests. The
-- reservation already reduced the balance; this records the lifecycle fact
-- without reducing it a second time.
INSERT INTO ledger_entries (
  merchant_id,
  withdrawal_id,
  amount_minor,
  currency,
  entry_type,
  reference_key
)
SELECT
  w.merchant_id,
  w.id,
  0,
  w.currency,
  'withdrawal_paid',
  'withdrawal:' || w.id::text || ':paid'
FROM withdrawals w
WHERE w.status = 'paid'
  AND NOT EXISTS (
    SELECT 1
    FROM ledger_entries le
    WHERE le.reference_key = 'withdrawal:' || w.id::text || ':paid'
  );