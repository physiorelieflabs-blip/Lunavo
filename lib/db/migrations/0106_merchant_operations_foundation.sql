-- 0106: real merchant operations foundation.
-- These records are operational, not financial. No table below can credit a
-- merchant balance or mark an order paid. Any actual customer refund/payment
-- must still pass through the existing TS Pay/provider boundary.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
  order_id integer REFERENCES orders(id) ON DELETE SET NULL,
  subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 1 AND 200),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 10000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to text,
  created_by text NOT NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_merchant_status_idx ON support_tickets(merchant_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_merchant_customer_idx ON support_tickets(merchant_id,customer_id,created_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  author_type text NOT NULL CHECK (author_type IN ('merchant','customer','system')),
  author_id text,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 12000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_ticket_created_idx ON support_messages(ticket_id,created_at);

CREATE TABLE IF NOT EXISTS service_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
  service_name text NOT NULL CHECK (char_length(btrim(service_name)) BETWEEN 1 AND 200),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','rescheduled','cancelled','completed','no_show')),
  notes text,
  idempotency_key text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_bookings_time_order CHECK (ends_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS service_bookings_merchant_idempotency_unique ON service_bookings(merchant_id,idempotency_key);
CREATE INDEX IF NOT EXISTS service_bookings_merchant_starts_idx ON service_bookings(merchant_id,starts_at);
ALTER TABLE service_bookings DROP CONSTRAINT IF EXISTS service_bookings_no_overlap;
ALTER TABLE service_bookings ADD CONSTRAINT service_bookings_no_overlap
  EXCLUDE USING gist (merchant_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&)
  WHERE (status IN ('requested','confirmed','rescheduled'));

CREATE TABLE IF NOT EXISTS return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','inspection','denied','refunded','exchanged','closed')),
  requested_amount_minor integer NOT NULL CHECK (requested_amount_minor > 0),
  currency text NOT NULL CHECK (currency = upper(currency) AND char_length(currency)=3),
  resolution text,
  requested_by text NOT NULL,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS return_requests_merchant_status_idx ON return_requests(merchant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS return_requests_order_idx ON return_requests(merchant_id,order_id,created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_name text NOT NULL CHECK (char_length(btrim(supplier_name)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ordered','partially_received','received','cancelled')),
  currency text NOT NULL CHECK (currency = upper(currency) AND char_length(currency)=3),
  notes text,
  ordered_at timestamptz,
  expected_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_orders_merchant_status_idx ON purchase_orders(merchant_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_product_id integer REFERENCES supplier_products(id) ON DELETE SET NULL,
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 500),
  quantity_ordered integer NOT NULL CHECK (quantity_ordered > 0),
  quantity_received integer NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost_minor integer NOT NULL CHECK (unit_cost_minor >= 0),
  currency text NOT NULL CHECK (currency = upper(currency) AND char_length(currency)=3),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_item_received_lte_ordered CHECK (quantity_received <= quantity_ordered)
);
CREATE INDEX IF NOT EXISTS purchase_order_items_order_idx ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS purchase_order_items_merchant_idx ON purchase_order_items(merchant_id);

CREATE TABLE IF NOT EXISTS b2b_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
  company_name text NOT NULL CHECK (char_length(btrim(company_name)) BETWEEN 1 AND 200),
  tax_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','suspended')),
  payment_terms_days integer NOT NULL DEFAULT 0 CHECK (payment_terms_days BETWEEN 0 AND 365),
  price_list jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS b2b_accounts_merchant_customer_unique ON b2b_accounts(merchant_id,customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS b2b_accounts_merchant_status_idx ON b2b_accounts(merchant_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS b2b_price_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  b2b_account_id uuid NOT NULL REFERENCES b2b_accounts(id) ON DELETE CASCADE,
  supplier_product_id integer NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  minimum_quantity integer NOT NULL CHECK (minimum_quantity > 0),
  unit_price_minor integer NOT NULL CHECK (unit_price_minor > 0),
  currency text NOT NULL CHECK (currency = upper(currency) AND char_length(currency)=3),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS b2b_price_rules_unique ON b2b_price_rules(b2b_account_id,supplier_product_id,minimum_quantity);
CREATE INDEX IF NOT EXISTS b2b_price_rules_merchant_idx ON b2b_price_rules(merchant_id,b2b_account_id);
