-- Persistent merchant AI operating memory.
-- Memory is advisory context, never financial/stock authority.

CREATE TABLE IF NOT EXISTS merchant_ai_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  memory_type text NOT NULL CHECK (memory_type IN (
    'preference','fact','decision','lesson','constraint','experiment','strategy'
  )),
  memory_key text NOT NULL,
  content text NOT NULL,
  confidence_bps integer NOT NULL DEFAULT 5000 CHECK (confidence_bps BETWEEN 0 AND 10000),
  source text NOT NULL,
  model text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, memory_type, memory_key)
);

CREATE INDEX IF NOT EXISTS merchant_ai_memory_recall_idx
  ON merchant_ai_memory(merchant_id, memory_type, confidence_bps DESC, updated_at DESC);
