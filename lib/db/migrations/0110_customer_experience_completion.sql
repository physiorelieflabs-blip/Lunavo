-- 0110_customer_experience_completion.sql
CREATE TABLE IF NOT EXISTS abandoned_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL, session_key text NOT NULL, customer_email text, customer_name text,
  cart_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb, currency text NOT NULL, subtotal_minor integer NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','abandoned','recovered','expired')),
  recovery_token_hash text NOT NULL, recovery_token_last4 text NOT NULL, last_activity_at timestamptz NOT NULL DEFAULT now(),
  abandoned_at timestamptz, recovered_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS abandoned_carts_active_session_unique ON abandoned_carts(merchant_id,session_key) WHERE status IN ('active','abandoned');
CREATE UNIQUE INDEX IF NOT EXISTS abandoned_carts_recovery_hash_unique ON abandoned_carts(recovery_token_hash);
CREATE INDEX IF NOT EXISTS abandoned_carts_merchant_status_idx ON abandoned_carts(merchant_id,status,last_activity_at);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE, customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Address', recipient_name text NOT NULL, phone text, address_line1 text NOT NULL, address_line2 text, city text NOT NULL, state text, postal_code text, country text NOT NULL,
  is_default boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_label_unique ON customer_addresses(merchant_id,customer_id,label);
CREATE INDEX IF NOT EXISTS customer_addresses_lookup_idx ON customer_addresses(merchant_id,customer_id,updated_at);

CREATE TABLE IF NOT EXISTS product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE, customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE, supplier_product_id integer NOT NULL, rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5), title text, body text NOT NULL,
  media jsonb NOT NULL DEFAULT '[]'::jsonb, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','flagged')), verified_purchase boolean NOT NULL DEFAULT false,
  merchant_reply text, merchant_reply_at timestamptz, report_count integer NOT NULL DEFAULT 0 CHECK (report_count >= 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_reviews_order_product_customer_unique ON product_reviews(merchant_id,customer_id,order_id,supplier_product_id);
CREATE INDEX IF NOT EXISTS product_reviews_public_idx ON product_reviews(merchant_id,supplier_product_id,status,created_at);

CREATE TABLE IF NOT EXISTS customer_saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE, visitor_key text NOT NULL, query text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_saved_search_unique ON customer_saved_searches(merchant_id,visitor_key,query);
CREATE INDEX IF NOT EXISTS customer_saved_search_lookup_idx ON customer_saved_searches(merchant_id,visitor_key,created_at);

CREATE TABLE IF NOT EXISTS customer_price_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE, visitor_key text NOT NULL, supplier_product_id integer NOT NULL,
  target_price numeric(14,2) NOT NULL CHECK (target_price >= 0), currency text NOT NULL, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_price_watch_unique ON customer_price_watches(merchant_id,visitor_key,supplier_product_id);
CREATE INDEX IF NOT EXISTS customer_price_watch_lookup_idx ON customer_price_watches(merchant_id,visitor_key,active);

CREATE TABLE IF NOT EXISTS customer_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE, visitor_key text NOT NULL,
  email_transactional boolean NOT NULL DEFAULT true, email_marketing boolean NOT NULL DEFAULT false, sms_marketing boolean NOT NULL DEFAULT false, push_marketing boolean NOT NULL DEFAULT false,
  product_alerts boolean NOT NULL DEFAULT true, review_requests boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_notification_preferences_unique ON customer_notification_preferences(merchant_id,visitor_key);