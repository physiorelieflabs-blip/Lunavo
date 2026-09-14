import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { decryptSecret } from "./withdrawal-security";

export async function loadStoredFlutterwaveCredential() {
  const hasSecret = Boolean(process.env.FLUTTERWAVE_SECRET_KEY?.trim() || process.env.FLW_SECRET_KEY?.trim());
  const hasWebhookSecret = Boolean(process.env.FLUTTERWAVE_WEBHOOK_SECRET?.trim() || process.env.FLW_WEBHOOK_HASH?.trim());
  if (hasSecret && hasWebhookSecret) return false;
  const result = await db.execute(sql`
    SELECT encrypted_secret_key, encrypted_webhook_secret
    FROM platform_integrations
    WHERE provider = 'flutterwave'
    LIMIT 1
  `);
  const row = result.rows[0] as { encrypted_secret_key?: string; encrypted_webhook_secret?: string | null } | undefined;
  let loaded = false;
  if (!hasSecret && row?.encrypted_secret_key) {
    process.env.FLUTTERWAVE_SECRET_KEY = decryptSecret(row.encrypted_secret_key);
    loaded = true;
  }
  if (!hasWebhookSecret && row?.encrypted_webhook_secret) {
    process.env.FLUTTERWAVE_WEBHOOK_SECRET = decryptSecret(row.encrypted_webhook_secret);
    loaded = true;
  }
  return loaded;
}
