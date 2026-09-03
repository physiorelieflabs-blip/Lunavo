ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS evidence_reference text;