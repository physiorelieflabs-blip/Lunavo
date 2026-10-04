-- Migration 0111: privacy-preserving supplier reputation network.
-- Merchants explicitly opt observations into the network. Public scores require
-- evidence from multiple independent merchants and expose aggregates only.

ALTER TABLE dropship_supplier_observations
  ADD COLUMN IF NOT EXISTS share_with_supplier_network boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS dropship_supplier_observations_network_idx
  ON dropship_supplier_observations(supplier_domain, observed_at DESC)
  WHERE share_with_supplier_network=true;
