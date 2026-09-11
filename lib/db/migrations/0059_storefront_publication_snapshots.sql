CREATE TABLE IF NOT EXISTS "storefront_publication_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "storefront_id" uuid NOT NULL REFERENCES "merchant_storefronts"("id") ON DELETE CASCADE,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "theme" jsonb NOT NULL,
  "sections" jsonb NOT NULL,
  "content_hash" text NOT NULL,
  "published_by_clerk_user_id" text NOT NULL,
  "published_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "storefront_publication_snapshots_storefront_version_idx" ON "storefront_publication_snapshots" ("storefront_id", "version");
CREATE INDEX IF NOT EXISTS "storefront_publication_snapshots_merchant_idx" ON "storefront_publication_snapshots" ("merchant_id", "published_at");
