CREATE TABLE IF NOT EXISTS "media_assets" (
  "id" serial PRIMARY KEY NOT NULL,
  "merchant_id" integer NOT NULL REFERENCES "merchants"("id"),
  "uploaded_by_clerk_user_id" text NOT NULL,
  "filename" text NOT NULL,
  "mime_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "image_data" text NOT NULL,
  "alt_text" text,
  "caption" text,
  "visibility" text NOT NULL DEFAULT 'private',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "media_assets_merchant_idx"
  ON "media_assets" ("merchant_id", "created_at");