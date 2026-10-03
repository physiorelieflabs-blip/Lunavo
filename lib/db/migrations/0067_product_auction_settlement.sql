CREATE TABLE IF NOT EXISTS "product_auction_settlements" (
  "id" bigserial PRIMARY KEY,
  "auction_id" integer NOT NULL REFERENCES "auction_listings"("id") ON DELETE RESTRICT,
  "bid_id" integer NOT NULL REFERENCES "auction_bids"("id") ON DELETE RESTRICT,
  "bidder_email" text NOT NULL,
  "amount" numeric(12,2) NOT NULL CHECK ("amount" > 0),
  "currency" text NOT NULL CHECK ("currency" = upper("currency") AND char_length("currency") = 3),
  "tx_ref" text NOT NULL UNIQUE,
  "provider" text NOT NULL DEFAULT 'flutterwave',
  "provider_transaction_id" text UNIQUE,
  "checkout_url" text,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','paid','failed','expired','reversed')),
  "paid_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "product_auction_settlement_active_bid_unique"
  ON "product_auction_settlements" ("auction_id", "bid_id")
  WHERE "status" IN ('pending','paid');
CREATE INDEX IF NOT EXISTS "product_auction_settlements_status_idx"
  ON "product_auction_settlements" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "product_auction_settlements_auction_idx"
  ON "product_auction_settlements" ("auction_id", "status");
