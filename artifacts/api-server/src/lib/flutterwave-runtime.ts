import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { decryptSecret } from "./withdrawal-security";

export async function loadStoredFlutterwaveCredential() {
  if (process.env.FLUTTERWAVE_SECRET_KEY?.trim() || process.env.FLW_SECRET_KEY?.trim()) return false;
  const result = await db.execute(sql`
    SELECT encrypted_secret_key
    FROM platform_integrations
    WHERE provider = 'flutterwave'
    LIMIT 1
  `);
  const encrypted = (result.rows[0] as { encrypted_secret_key?: string } | undefined)?.encrypted_secret_key;
  if (!encrypted) return false;
  process.env.FLUTTERWAVE_SECRET_KEY = decryptSecret(encrypted);
  return true;
}
