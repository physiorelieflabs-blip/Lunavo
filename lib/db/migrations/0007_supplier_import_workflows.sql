drop index if exists supplier_products_merchant_url_unique;

create table if not exists suppliers (
  id serial primary key,
  merchant_id integer not null references merchants(id),
  name text not null,
  website text not null,
  domain text not null,
  contact_email text,
  contact_phone text,
  category text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists suppliers_merchant_domain_unique
  on suppliers (merchant_id, domain);

alter table supplier_products
  add column if not exists supplier_id integer references suppliers(id),
  add column if not exists source_product_id text,
  add column if not exists image_urls jsonb,
  add column if not exists video_urls jsonb,
  add column if not exists sale_price numeric(12, 2),
  add column if not exists sku text,
  add column if not exists variants jsonb,
  add column if not exists attributes jsonb,
  add column if not exists availability text,
  add column if not exists availability_quantity integer,
  add column if not exists inventory_strategy text not null default 'source_based',
  add column if not exists inventory_status text not null default 'unknown',
  add column if not exists category text,
  add column if not exists tags jsonb,
  add column if not exists specifications jsonb,
  add column if not exists brand text,
  add column if not exists shipping_information jsonb,
  add column if not exists tax_configuration jsonb,
  add column if not exists shipping_configuration jsonb,
  add column if not exists seo_configuration jsonb,
  add column if not exists source_metadata jsonb,
  add column if not exists merchant_overrides jsonb,
  add column if not exists pricing_mode text not null default 'fixed_markup',
  add column if not exists visibility text not null default 'draft',
  add column if not exists marketplace_visibility boolean not null default false,
  add column if not exists import_status text not null default 'imported',
  add column if not exists import_error text,
  add column if not exists last_attempted_sync timestamptz,
  add column if not exists published_at timestamptz;

create table if not exists supplier_import_batches (
  id serial primary key,
  merchant_id integer not null references merchants(id),
  status text not null default 'analyzing',
  source_count integer not null default 0,
  completed_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists supplier_import_attempts (
  id serial primary key,
  merchant_id integer not null references merchants(id),
  supplier_product_id integer references supplier_products(id),
  batch_id integer references supplier_import_batches(id),
  source_url text not null,
  status text not null,
  message text,
  changes jsonb,
  created_at timestamptz not null default now()
);

alter table orders
  add column if not exists supplier_order_reference text,
  add column if not exists tracking_number text,
  add column if not exists fulfillment_note text,
  add column if not exists fulfillment_submitted_at timestamptz,
  add column if not exists fulfillment_updated_at timestamptz;