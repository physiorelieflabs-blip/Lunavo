-- Same-SKU Buy-X-Get-Y-free promotion terms for the existing single-line checkout model.
-- The checkout snapshots the terms on the redemption row for later audit/reconciliation.
ALTER TABLE discount_codes
  ADD COLUMN IF NOT EXISTS buy_quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS get_quantity integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  ALTER TABLE discount_codes
    ADD CONSTRAINT discount_codes_buy_quantity_range
    CHECK (buy_quantity BETWEEN 1 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE discount_codes
    ADD CONSTRAINT discount_codes_get_quantity_range
    CHECK (get_quantity BETWEEN 1 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE discount_code_redemptions
  ADD COLUMN IF NOT EXISTS buy_quantity_snapshot integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS get_quantity_snapshot integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  ALTER TABLE discount_code_redemptions
    ADD CONSTRAINT discount_code_redemptions_buy_snapshot_range
    CHECK (buy_quantity_snapshot BETWEEN 1 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE discount_code_redemptions
    ADD CONSTRAINT discount_code_redemptions_get_snapshot_range
    CHECK (get_quantity_snapshot BETWEEN 1 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
