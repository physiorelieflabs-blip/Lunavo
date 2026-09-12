CREATE TABLE IF NOT EXISTS "store_auction_payment_verifications" (
  "id" bigserial PRIMARY KEY,
  "auction_id" bigint NOT NULL REFERENCES "store_auction_listings"("id") ON DELETE RESTRICT,
  "bid_id" bigint NOT NULL REFERENCES "store_auction_bids"("id") ON DELETE RESTRICT,
  "provider" text NOT NULL,
  "provider_reference" text NOT NULL,
  "amount" numeric(18,2) NOT NULL CHECK ("amount" > 0),
  "currency" text NOT NULL CHECK ("currency" = upper("currency") AND char_length("currency") = 3),
  "status" text NOT NULL CHECK ("status" IN ('verified','failed','reversed')),
  "verified_at" timestamptz,
  "evidence_hash" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("provider", "provider_reference"),
  UNIQUE ("auction_id", "bid_id", "status")
);
CREATE INDEX IF NOT EXISTS "store_auction_payment_verifications_auction_idx" ON "store_auction_payment_verifications" ("auction_id", "status", "verified_at" DESC);

ALTER TABLE "store_auction_listings"
  ADD CONSTRAINT "store_auction_payment_reference_unique" UNIQUE ("payment_reference");
