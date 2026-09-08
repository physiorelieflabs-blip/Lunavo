-- Self-hosted ad campaign and creative persistence.
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  product_id integer,
  goal text NOT NULL DEFAULT 'sales',
  audience text,
  offer text,
  status text NOT NULL DEFAULT 'draft',
  brain_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  product_id integer,
  platform text NOT NULL,
  aspect_ratio text NOT NULL,
  duration_seconds integer NOT NULL,
  title text NOT NULL,
  caption text,
  hashtags jsonb NOT NULL DEFAULT '[]'::jsonb,
  script jsonb NOT NULL DEFAULT '[]'::jsonb,
  mime_type text NOT NULL DEFAULT 'video/mp4',
  video_data text,
  status text NOT NULL DEFAULT 'queued',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS ad_creatives_campaign_platform_unique ON ad_creatives(campaign_id, platform);
CREATE INDEX IF NOT EXISTS ad_creatives_merchant_created_idx ON ad_creatives(merchant_id, created_at);

INSERT INTO _ts_commerce_migrations (id)
VALUES ('0054_self_hosted_ad_studio')
ON CONFLICT (id) DO NOTHING;
