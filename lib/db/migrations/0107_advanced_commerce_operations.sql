-- Lunavo advanced commerce operations: production persistence for historically requested
-- operational domains that were not previously represented by dedicated workflows.
CREATE TABLE IF NOT EXISTS merchant_operation_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'return','exchange','booking','event','ticket','quote','purchase_order','expense',
    'lead','task','support_ticket','message_thread','preorder','waitlist','product_alert',
    'document','customer_document','app_listing','theme_listing','creator_listing'
  )),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','pending','open','active','approved','scheduled','in_progress','resolved',
    'completed','cancelled','rejected','closed','archived'
  )),
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
  order_id integer REFERENCES orders(id) ON DELETE SET NULL,
  related_type text,
  related_id text,
  reference text,
  amount_minor bigint,
  currency text,
  starts_at timestamptz,
  ends_at timestamptz,
  due_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS merchant_operation_records_reference_unique
  ON merchant_operation_records(merchant_id,kind,reference)
  WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_operation_records_merchant_kind_status_idx
  ON merchant_operation_records(merchant_id,kind,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS merchant_operation_records_customer_idx
  ON merchant_operation_records(merchant_id,customer_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS merchant_operation_records_order_idx
  ON merchant_operation_records(merchant_id,order_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS merchant_operation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES merchant_operation_records(id) ON DELETE CASCADE,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_id text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS merchant_operation_events_operation_idx
  ON merchant_operation_events(operation_id,created_at DESC);

CREATE TABLE IF NOT EXISTS merchant_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes jsonb NOT NULL DEFAULT '["api.read"]'::jsonb,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS merchant_api_keys_name_unique
  ON merchant_api_keys(merchant_id,name)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS merchant_api_keys_merchant_idx
  ON merchant_api_keys(merchant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS merchant_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id,key)
);

CREATE TABLE IF NOT EXISTS merchant_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed')),
  variants jsonb NOT NULL DEFAULT '[{"key":"control","weight":50},{"key":"variant","weight":50}]'::jsonb,
  hypothesis text,
  metrics jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id,key)
);

CREATE TABLE IF NOT EXISTS merchant_experiment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES merchant_experiments(id) ON DELETE CASCADE,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  subject_key text NOT NULL,
  variant_key text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experiment_id,subject_key)
);

CREATE TABLE IF NOT EXISTS merchant_accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','locked')),
  closed_by text,
  closed_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_date <= end_date),
  UNIQUE (merchant_id,period_key),
  UNIQUE (merchant_id,start_date,end_date)
);
CREATE INDEX IF NOT EXISTS merchant_accounting_periods_status_idx
  ON merchant_accounting_periods(merchant_id,status,start_date DESC);

CREATE TABLE IF NOT EXISTS merchant_message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  subject text,
  participant_type text NOT NULL DEFAULT 'internal',
  participant_id text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','archived')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS merchant_message_threads_merchant_idx
  ON merchant_message_threads(merchant_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS merchant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES merchant_message_threads(id) ON DELETE CASCADE,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  sender_id text NOT NULL,
  body text NOT NULL,
  attachment_metadata jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS merchant_messages_thread_idx
  ON merchant_messages(merchant_id,thread_id,created_at ASC);

CREATE TABLE IF NOT EXISTS merchant_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  document_kind text NOT NULL,
  title text NOT NULL,
  entity_type text,
  entity_id text,
  media_asset_id text,
  mime_type text,
  byte_size bigint,
  sha256 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS merchant_documents_entity_idx
  ON merchant_documents(merchant_id,entity_type,entity_id,created_at DESC);
