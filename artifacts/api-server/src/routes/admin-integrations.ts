import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "../lib/auth-compat";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { encryptSecret } from "../lib/withdrawal-security";
import { requireMasterAdmin } from "../lib/master-admin";
import {
  checkFlutterwaveConnection,
  flutterwaveCredentialMode,
  isFlutterwaveConfigured,
} from "../lib/flutterwave-client";
import {
  getStoredFlutterwaveCredentials,
  primeFlutterwaveCredentialCache,
} from "../lib/flutterwave-runtime";

const router: IRouter = Router();

async function requireAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in required" });
    return null;
  }
  try {
    await requireMasterAdmin(userId);
    return userId;
  } catch {
    res.status(403).json({ error: "Master admin access required" });
    return null;
  }
}

router.get("/admin/integrations/flutterwave", async (req, res, next) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const result = await db.execute(sql`
      SELECT credential_mode,updated_at,
             (encrypted_secret_key IS NOT NULL AND encrypted_secret_key <> '') AS api_configured,
             (encrypted_webhook_secret IS NOT NULL AND encrypted_webhook_secret <> '') AS webhook_configured
      FROM platform_integrations
      WHERE provider='flutterwave'
      LIMIT 1
    `);
    const row = result.rows[0] as {
      credential_mode?: string | null;
      updated_at?: string | null;
      api_configured?: boolean;
      webhook_configured?: boolean;
    } | undefined;
    const runtime = await getStoredFlutterwaveCredentials();
    res.json({
      connected: Boolean(row?.api_configured) || Boolean(runtime.secretKey) || isFlutterwaveConfigured(),
      mode: row?.credential_mode ?? runtime.mode ?? flutterwaveCredentialMode(),
      updatedAt: row?.updated_at ?? null,
      webhookConfigured: Boolean(row?.webhook_configured) || Boolean(runtime.webhookSecret),
      provider: "flutterwave",
      account: userId,
    });
  } catch (error) {
    next(error);
  }
});

router.put("/admin/integrations/flutterwave", async (req, res, next) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
    const webhookSecret = typeof req.body?.webhookSecret === "string" ? req.body.webhookSecret.trim() : "";

    if (!apiKey && !webhookSecret) {
      res.status(400).json({ error: "Provide a Flutterwave Secret API Key or Webhook Secret to change." });
      return;
    }

    const existing = await db.execute(sql`
      SELECT encrypted_secret_key,encrypted_webhook_secret,credential_mode
      FROM platform_integrations
      WHERE provider='flutterwave'
      LIMIT 1
    `);
    const existingRow = existing.rows[0] as {
      encrypted_secret_key?: string | null;
      encrypted_webhook_secret?: string | null;
      credential_mode?: "live" | "test" | "unknown" | null;
    } | undefined;

    const runtime = await getStoredFlutterwaveCredentials();
    if (!apiKey && !existingRow?.encrypted_secret_key && !runtime.secretKey) {
      res.status(400).json({ error: "Save the Flutterwave Secret API Key before saving only the Webhook Secret." });
      return;
    }

    let mode: "live" | "test" | "unknown" =
      existingRow?.credential_mode ?? runtime.mode ?? "unknown";

    if (apiKey) {
      mode =
        apiKey.startsWith("FLWSECK_TEST-") ? "test" :
        apiKey.startsWith("FLWSECK-") ? "live" : "unknown";
      if (apiKey.length < 20 || apiKey.length > 500 || mode === "unknown") {
        res.status(400).json({
          error: "Enter a valid Flutterwave secret API key (FLWSECK- or FLWSECK_TEST-).",
        });
        return;
      }
    }

    if (webhookSecret && (webhookSecret.length < 8 || webhookSecret.length > 500)) {
      res.status(400).json({ error: "Webhook Secret must be between 8 and 500 characters." });
      return;
    }

    // Validate a new payment credential directly. Never copy it into process.env:
    // process-wide mutation would leak credential state across concurrent requests
    // and would make live rotation dependent on a service restart.
    if (apiKey) {
      const connection = await checkFlutterwaveConnection(apiKey);
      const status = connection.status.toLowerCase();
      if (!["success", "successful", "ok"].includes(status)) {
        res.status(400).json({
          error: `Flutterwave connection was not accepted (status: ${connection.status})`,
        });
        return;
      }
    }

    const encryptedApiKey = apiKey
      ? encryptSecret(apiKey)
      : existingRow?.encrypted_secret_key ?? null;
    const encryptedWebhook = webhookSecret
      ? encryptSecret(webhookSecret)
      : existingRow?.encrypted_webhook_secret ?? null;

    if (!encryptedApiKey && !runtime.secretKey) {
      res.status(400).json({ error: "No encrypted Flutterwave API credential is available." });
      return;
    }
    if (!encryptedWebhook && !runtime.webhookSecret) {
      res.status(400).json({ error: "No Flutterwave Webhook Secret is configured." });
      return;
    }

    await db.execute(sql`
      INSERT INTO platform_integrations
        (provider,encrypted_secret_key,credential_mode,encrypted_webhook_secret,updated_at)
      VALUES
        ('flutterwave',${encryptedApiKey},${mode},${encryptedWebhook},now())
      ON CONFLICT(provider) DO UPDATE SET
        encrypted_secret_key=COALESCE(EXCLUDED.encrypted_secret_key,platform_integrations.encrypted_secret_key),
        credential_mode=EXCLUDED.credential_mode,
        encrypted_webhook_secret=COALESCE(EXCLUDED.encrypted_webhook_secret,platform_integrations.encrypted_webhook_secret),
        updated_at=now()
    `);

    const stored = await db.execute(sql`
      SELECT encrypted_secret_key,encrypted_webhook_secret
      FROM platform_integrations
      WHERE provider='flutterwave'
      LIMIT 1
    `);
    const storedRow = stored.rows[0] as {
      encrypted_secret_key?: string | null;
      encrypted_webhook_secret?: string | null;
    } | undefined;

    // Prime this process immediately; other processes will refresh from the DB
    // within the runtime cache TTL, so rotation does not require restart.
    const resolvedKey = storedRow?.encrypted_secret_key
      ? (apiKey || (runtime.secretKey ?? null))
      : (runtime.secretKey ?? null);
    const resolvedWebhook = storedRow?.encrypted_webhook_secret
      ? (webhookSecret || (runtime.webhookSecret ?? null))
      : (runtime.webhookSecret ?? null);
    primeFlutterwaveCredentialCache({
      secretKey: resolvedKey,
      webhookSecret: resolvedWebhook,
    });

    await db.execute(sql`
      INSERT INTO audit_logs
        (user_id,merchant_id,action,resource_type,resource_id,changes,ip_address,user_agent,status,created_at)
      VALUES
        (${userId},NULL,'flutterwave_credentials_rotated','platform_integration','flutterwave',
         ${JSON.stringify({
           apiKeyChanged: Boolean(apiKey),
           webhookSecretChanged: Boolean(webhookSecret),
           mode,
         })}::jsonb,
         ${req.ip ?? null},${req.get("user-agent")?.slice(0,500) ?? null},'success',now())
    `);

    res.json({
      connected: Boolean(resolvedKey),
      mode,
      webhookConfigured: Boolean(resolvedWebhook),
      provider: "flutterwave",
      status: apiKey ? "validated_and_saved" : "webhook_secret_saved",
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Flutterwave integration update failed",
    });
  }
});

export default router;
