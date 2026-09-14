import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { encryptSecret } from "../lib/withdrawal-security";
import { requireMasterAdmin } from "../lib/master-admin";
import { checkFlutterwaveConnection, flutterwaveCredentialMode, isFlutterwaveConfigured } from "../lib/flutterwave-client";

const router: IRouter = Router();

async function requireAdmin(req: Request, res: Response) {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Sign in required" }); return false; }
  try { await requireMasterAdmin(userId); return true; }
  catch { res.status(403).json({ error: "Master admin access required" }); return false; }
}

router.get("/admin/integrations/flutterwave", async (req, res, next) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const result = await db.execute(sql`SELECT credential_mode, updated_at, (encrypted_webhook_secret IS NOT NULL) AS webhook_configured FROM platform_integrations WHERE provider = 'flutterwave' LIMIT 1`);
    const row = result.rows[0] as { credential_mode?: string; updated_at?: string; webhook_configured?: boolean } | undefined;
    res.json({
      connected: Boolean(row) || isFlutterwaveConfigured(),
      mode: row?.credential_mode ?? flutterwaveCredentialMode(),
      updatedAt: row?.updated_at ?? null,
      webhookConfigured: Boolean(row?.webhook_configured || process.env.FLUTTERWAVE_WEBHOOK_SECRET?.trim() || process.env.FLW_WEBHOOK_HASH?.trim()),
      provider: "flutterwave",
    });
  } catch (error) { next(error); }
});

router.put("/admin/integrations/flutterwave", async (req, res, next) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
    const webhookSecret = typeof req.body?.webhookSecret === "string" ? req.body.webhookSecret.trim() : "";
    if (!apiKey && !webhookSecret) { res.status(400).json({ error: "Provide a Flutterwave Secret API Key or Webhook Secret to change." }); return; }

    let mode: "live" | "test" | "unknown" = flutterwaveCredentialMode();
    if (apiKey) {
      mode = apiKey.startsWith("FLWSECK_TEST-") ? "test" : apiKey.startsWith("FLWSECK-") ? "live" : "unknown";
      if (apiKey.length < 20 || apiKey.length > 500 || mode === "unknown") {
        res.status(400).json({ error: "Enter a valid Flutterwave secret API key (FLWSECK- or FLWSECK_TEST-)." }); return;
      }
    }
    if (webhookSecret && (webhookSecret.length < 8 || webhookSecret.length > 500)) {
      res.status(400).json({ error: "Webhook Secret must be between 8 and 500 characters." }); return;
    }

    const previousKey = process.env.FLUTTERWAVE_SECRET_KEY;
    const previousWebhook = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
    if (apiKey) process.env.FLUTTERWAVE_SECRET_KEY = apiKey;
    if (webhookSecret) process.env.FLUTTERWAVE_WEBHOOK_SECRET = webhookSecret;
    try {
      if (apiKey) {
        const connection = await checkFlutterwaveConnection();
        const providerStatus = connection.status.toLowerCase();
        if (!["success", "successful", "ok"].includes(providerStatus)) throw new Error(`Flutterwave connection was not accepted (status: ${connection.status})`);
      }
      const encryptedApiKey = apiKey ? encryptSecret(apiKey) : null;
      const encryptedWebhook = webhookSecret ? encryptSecret(webhookSecret) : null;
      await db.execute(sql`
        INSERT INTO platform_integrations (provider, encrypted_secret_key, credential_mode, encrypted_webhook_secret, updated_at)
        VALUES ('flutterwave', ${encryptedApiKey ?? encryptSecret(previousKey ?? "")}, ${mode}, ${encryptedWebhook}, now())
        ON CONFLICT (provider) DO UPDATE SET
          encrypted_secret_key = COALESCE(EXCLUDED.encrypted_secret_key, platform_integrations.encrypted_secret_key),
          credential_mode = CASE WHEN ${Boolean(apiKey)} THEN EXCLUDED.credential_mode ELSE platform_integrations.credential_mode END,
          encrypted_webhook_secret = COALESCE(EXCLUDED.encrypted_webhook_secret, platform_integrations.encrypted_webhook_secret),
          updated_at = now()
      `);
      res.json({ connected: Boolean(apiKey) || isFlutterwaveConfigured(), mode: apiKey ? mode : flutterwaveCredentialMode(), webhookConfigured: Boolean(webhookSecret || previousWebhook), provider: "flutterwave", status: apiKey ? "success" : "saved", updatedAt: new Date().toISOString() });
    } catch (error) {
      if (previousKey) process.env.FLUTTERWAVE_SECRET_KEY = previousKey; else if (apiKey) delete process.env.FLUTTERWAVE_SECRET_KEY;
      if (previousWebhook) process.env.FLUTTERWAVE_WEBHOOK_SECRET = previousWebhook; else if (webhookSecret) delete process.env.FLUTTERWAVE_WEBHOOK_SECRET;
      throw error;
    }
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Flutterwave integration update failed" }); }
});

export default router;
