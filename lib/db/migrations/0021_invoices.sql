CREATE TABLE invoices (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  customer_id integer REFERENCES customers(id),
  order_id integer REFERENCES orders(id),
  payment_link_id integer REFERENCES payment_links(id),
  invoice_number text NOT NULL,
  public_token text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  billing_address jsonb,
  shipping_address jsonb,
  currency text NOT NULL,
  subtotal numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  shipping_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
  total numeric(12,2) NOT NULL CHECK (total >= 0),
  amount_paid numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  due_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'void')),
  notes text,
  terms text,
  payment_reference text,
  sent_at timestamptz,
  viewed_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_total_snapshot_check CHECK (total = subtotal - discount_amount + tax_amount + shipping_amount)
);
CREATE UNIQUE INDEX invoices_merchant_number_unique ON invoices(merchant_id, invoice_number);
CREATE INDEX invoices_merchant_status_created_idx ON invoices(merchant_id, status, created_at);
CREATE INDEX invoices_public_token_idx ON invoices(public_token);

CREATE TABLE invoice_lines (
  id serial PRIMARY KEY,
  invoice_id integer NOT NULL REFERENCES invoices(id),
  position integer NOT NULL CHECK (position >= 0),
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_lines_total_snapshot_check CHECK (line_total = round(quantity * unit_price, 2))
);
CREATE UNIQUE INDEX invoice_lines_invoice_position_unique ON invoice_lines(invoice_id, position);
CREATE INDEX invoice_lines_invoice_idx ON invoice_lines(invoice_id);

CREATE TABLE invoice_payment_submissions (
  id serial PRIMARY KEY,
  invoice_id integer NOT NULL REFERENCES invoices(id),
  merchant_id integer NOT NULL REFERENCES merchants(id),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  payment_reference text NOT NULL,
  sender_name text,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'verified', 'rejected')),
  review_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX invoice_payment_submissions_reference_unique
  ON invoice_payment_submissions(upper(btrim(payment_reference)));
CREATE INDEX invoice_payment_submissions_invoice_status_idx
  ON invoice_payment_submissions(invoice_id, status);

-- Invoice verification feeds the same authoritative payment/ledger boundary as
-- orders. A payment intent has exactly one source, enforced by the application
-- and unique source indexes; the invoice submission is the idempotency anchor.
ALTER TABLE payment_intents ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE payment_intents ADD COLUMN invoice_payment_submission_id integer REFERENCES invoice_payment_submissions(id);
CREATE UNIQUE INDEX payment_intents_invoice_submission_unique ON payment_intents(invoice_payment_submission_id);
ALTER TABLE payment_records ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE payment_records ADD COLUMN invoice_payment_submission_id integer REFERENCES invoice_payment_submissions(id);
ALTER TABLE ledger_entries ADD COLUMN invoice_id integer REFERENCES invoices(id);