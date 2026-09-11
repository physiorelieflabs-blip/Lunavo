CREATE TABLE IF NOT EXISTS "storefront_publication_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "storefront_id" uuid NOT NULL REFERENCES "merchant_storefronts"("id") ON DELETE CASCADE,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "theme" jsonb NOT NULL,
  "sections" jsonb NOT NULL,
  "content_hash" text NOT NULL,
  "published_by_clerk_user_id" text NOT NULL,
  "published_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "storefront_publication_snapshots_storefront_version_unique" UNIQUE ("storefront_id", "version")
);
CREATE INDEX IF NOT EXISTS "storefront_publication_snapshots_merchant_idx" ON "storefront_publication_snapshots" ("merchant_id", "published_at");

-- Existing published storefronts get an immutable baseline snapshot so later
-- draft edits cannot silently change what customers see.
INSERT INTO "storefront_publication_snapshots" ("storefront_id", "merchant_id", "version", "theme", "sections", "content_hash", "published_by_clerk_user_id")
SELECT s."id", s."merchant_id", 1, s."theme", s."sections",
       md5((json_build_object('theme', s."theme", 'sections', s."sections"))::text),
       s."created_by_clerk_user_id"
FROM "merchant_storefronts" s
WHERE s."published" = true
  AND NOT EXISTS (SELECT 1 FROM "storefront_publication_snapshots" p WHERE p."storefront_id" = s."id");
