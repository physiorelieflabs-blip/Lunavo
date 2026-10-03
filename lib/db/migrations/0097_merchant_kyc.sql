CREATE TABLE IF NOT EXISTS merchant_kyc (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  legal_name text,
  business_type text,
  country text,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  government_id_type text,
  government_id_ciphertext text,
  document_data text,
  submitted_by text,
  submitted_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT merchant_kyc_status_check CHECK (status IN ('pending','approved','rejected'))
);

CREATE INDEX IF NOT EXISTS merchant_kyc_status_idx
  ON merchant_kyc (status, updated_at);

COMMENT ON TABLE merchant_kyc IS 'Merchant payout eligibility verification. Sensitive identity values are encrypted by the application.';
