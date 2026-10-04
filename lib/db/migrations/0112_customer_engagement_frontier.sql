-- 0112_customer_engagement_frontier.sql
CREATE TABLE IF NOT EXISTS customer_wishlist_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  visitor_key text NOT NULL,
  supplier_product_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_wishlist_visitors_unique
  ON customer_wishlist_visitors(merchant_id,visitor_key,supplier_product_id);
CREATE INDEX IF NOT EXISTS customer_wishlist_visitors_lookup
  ON customer_wishlist_visitors(merchant_id,visitor_key,created_at DESC);

CREATE TABLE IF NOT EXISTS customer_recently_viewed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  visitor_key text NOT NULL,
  supplier_product_id integer NOT NULL,
  view_count integer NOT NULL DEFAULT 1 CHECK (view_count > 0),
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  last_viewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_recently_viewed_unique
  ON customer_recently_viewed(merchant_id,visitor_key,supplier_product_id);
CREATE INDEX IF NOT EXISTS customer_recently_viewed_lookup
  ON customer_recently_viewed(merchant_id,visitor_key,last_viewed_at DESC);

CREATE TABLE IF NOT EXISTS customer_stock_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  visitor_key text NOT NULL,
  supplier_product_id integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  triggered_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_stock_watches_unique
  ON customer_stock_watches(merchant_id,visitor_key,supplier_product_id);
CREATE INDEX IF NOT EXISTS customer_stock_watches_lookup
  ON customer_stock_watches(merchant_id,visitor_key,active);

CREATE TABLE IF NOT EXISTS product_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_product_id integer NOT NULL,
  visitor_key text NOT NULL,
  question text NOT NULL,
  answer text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','answered','rejected')),
  answered_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_questions_public_lookup
  ON product_questions(merchant_id,supplier_product_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS product_questions_merchant_lookup
  ON product_questions(merchant_id,status,updated_at DESC);
