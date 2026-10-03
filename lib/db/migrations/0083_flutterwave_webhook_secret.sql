ALTER TABLE platform_integrations
  ADD COLUMN IF NOT EXISTS encrypted_webhook_secret text;
