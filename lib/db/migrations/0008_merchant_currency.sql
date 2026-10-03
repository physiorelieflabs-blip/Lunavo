-- Migration 0008: Multi-currency support (already in core schema)
ALTER TABLE lunavo.merchants ADD COLUMN IF NOT EXISTS preferred_currency VARCHAR(3) DEFAULT 'USD';
