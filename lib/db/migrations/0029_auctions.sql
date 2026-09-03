CREATE TABLE IF NOT EXISTS "auction_listings" (
  "id" serial PRIMARY KEY NOT NULL,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id"),
  "supplier_product_id" integer NOT NULL REFERENCES "supplier_products"("id"),
  "title" text NOT NULL,
  "description" text,
  "image_url" text,
  "currency" text NOT NULL,
  "starting_price" numeric(12, 2) NOT NULL,
  "reserve_price" numeric(12, 2),
  "starts_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "auction_listings_merchant_status_idx"
  ON "auction_listings" ("merchant_id", "status");
CREATE INDEX IF NOT EXISTS "auction_listings_status_ends_idx"
  ON "auction_listings" ("status", "ends_at");

CREATE TABLE IF NOT EXISTS "auction_bids" (
  "id" serial PRIMARY KEY NOT NULL,
  "auction_id" integer NOT NULL REFERENCES "auction_listings"("id") ON DELETE CASCADE,
  "bidder_name" text NOT NULL,
  "bidder_email" text NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "auction_bids_auction_amount_idx"
  ON "auction_bids" ("auction_id", "amount");
CREATE INDEX IF NOT EXISTS "auction_bids_email_created_idx"
  ON "auction_bids" ("bidder_email", "created_at");