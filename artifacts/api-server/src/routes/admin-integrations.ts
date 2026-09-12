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
    const result = await db.execute(sql`SELECT credential_mode, updated_at FROM platform_integrations WHERE provider = 'flutterwave' LIMIT 1`);
    const row = result.rows[0] as { credential_mode?: string; updated_at?: string } | undefined;
    res.json({ connected: Boolean(row) || isFlutterwaveConfigured(), mode: row?.credential_mode ?? flutterwaveCredentialMode(), updatedAt: row?.updated_at ?? null, provider: "flutterwave" });
  } catch (error) { next(error); }
});

router.put("/admin/integrations/flutterwave", async (req, res, next) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
    const mode = apiKey.startsWith("FLWSECK_TEST-") ? "test" : apiKey.startsWith("FLWSECK-") ? "live" : "unknown";
    if (!apiKey || apiKey.length < 20 || apiKey.length > 500 || mode === "unknown") {
      res.status(400).json({ error: "Enter a valid Flutterwave secret API key (FLWSECK- or FLWSECK_TEST-)." }); return;
    }
    const previousKey = process.env.FLUTTERWAVE_SECRET_KEY;
    process.env.FLUTTERWAVE_SECRET_KEY = apiKey;
    try {
      const connection = await checkFlutterwaveConnection();
      const providerStatus = connection.status.toLowerCase();
      if (!["success", "successful", "ok"].includes(providerStatus)) throw new Error(`Flutterwave connection was not accepted (status: ${connection.status})`);
      const encrypted = encryptSecret(apiKey);
      await db.execute(sql`
        INSERT INTO platform_integrations (provider, encrypted_secret_key, credential_mode, updated_at)
        VALUES ('flutterwave', ${encrypted}, ${mode}, now())
        ON CONFLICT (provider) DO UPDATE SET encrypted_secret_key = EXCLUDED.encrypted_secret_key, credential_mode = EXCLUDED.credential_mode, updated_at = now()
      `);
      res.json({ connected: true, mode, provider: "flutterwave", status: connection.status, updatedAt: new Date().toISOString() });
    } catch (error) {
      if (previousKey) process.env.FLUTTERWAVE_SECRET_KEY = previousKey; else delete process.env.FLUTTERWAVE_SECRET_KEY;
      throw error;
    }
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Flutterwave connection failed" }); }
});

export default router;
