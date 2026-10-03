import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { decryptSecret } from "./withdrawal-security";

type FlutterwaveSecrets = {
  secretKey: string | null;
  webhookSecret: string | null;
  mode: "live" | "test" | "unknown";
  loadedAt: number;
};

const CACHE_TTL_MS = 30_000;
let cache: FlutterwaveSecrets | null = null;

function envSecret(primary: string, legacy: string): string | null {
  const value = process.env[primary]?.trim() || process.env[legacy]?.trim() || "";
  return value || null;
}

function modeForSecret(secretKey: string | null): FlutterwaveSecrets["mode"] {
  if (secretKey?.startsWith("FLWSECK_TEST-")) return "test";
  if (secretKey?.startsWith("FLWSECK-")) return "live";
  return "unknown";
}

function cacheUsable(value: FlutterwaveSecrets | null) {
  return Boolean(value && Date.now() - value.loadedAt < CACHE_TTL_MS);
}

export function clearFlutterwaveCredentialCache() {
  cache = null;
}

export function cachedFlutterwaveSecretKey(): string | null {
  if (cacheUsable(cache)) return cache?.secretKey ?? null;
  return null;
}

export function cachedFlutterwaveWebhookSecret(): string | null {
  if (cacheUsable(cache)) return cache?.webhookSecret ?? null;
  return null;
}

export function primeFlutterwaveCredentialCache(input: {
  secretKey?: string | null;
  webhookSecret?: string | null;
}) {
  const secretKey = input.secretKey?.trim() || null;
  const webhookSecret = input.webhookSecret?.trim() || null;
  cache = {
    secretKey,
    webhookSecret,
    mode: modeForSecret(secretKey),
    loadedAt: Date.now(),
  };
}

export async function getStoredFlutterwaveCredentials(options: { forceRefresh?: boolean } = {}): Promise<FlutterwaveSecrets> {
  const envKey = envSecret("FLUTTERWAVE_SECRET_KEY", "FLW_SECRET_KEY");
  const envWebhook = envSecret("FLUTTERWAVE_WEBHOOK_SECRET", "FLW_WEBHOOK_HASH");
  if (!options.forceRefresh && cacheUsable(cache) && !envKey && !envWebhook) return cache!;

  const result = await db.execute(sql`
    SELECT encrypted_secret_key, encrypted_webhook_secret
    FROM platform_integrations
    WHERE provider = 'flutterwave'
    LIMIT 1
  `);
  const row = result.rows[0] as {
    encrypted_secret_key?: string | null;
    encrypted_webhook_secret?: string | null;
  } | undefined;

  const secretKey = envKey || (row?.encrypted_secret_key ? decryptSecret(row.encrypted_secret_key) : null);
  const webhookSecret = envWebhook || (row?.encrypted_webhook_secret ? decryptSecret(row.encrypted_webhook_secret) : null);
  const resolved = {
    secretKey,
    webhookSecret,
    mode: modeForSecret(secretKey),
    loadedAt: Date.now(),
  } as FlutterwaveSecrets;

  cache = resolved;
  return resolved;
}

/**
 * Backward-compatible startup warm-up. It deliberately does not copy secrets
 * into process.env: runtime credential rotation must stay database-backed and
 * request-safe.
 */
export async function loadStoredFlutterwaveCredential() {
  const before = cache;
  const resolved = await getStoredFlutterwaveCredentials();
  return !before || before.secretKey !== resolved.secretKey || before.webhookSecret !== resolved.webhookSecret;
}
