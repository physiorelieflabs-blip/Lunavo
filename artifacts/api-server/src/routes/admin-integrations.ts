import { Router, type IRouter, type Request, type Response } from "express";
import { createClerkClient, getAuth } from "@clerk/express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { encryptSecret } from "../lib/withdrawal-security";
import {
  checkFlutterwaveConnection,
  flutterwaveCredentialMode,
  isFlutterwaveConfigured,
} from "../lib/flutterwave-client";

const router: IRouter = Router();
const ADMIN_EMAIL = "ifeoluwaolowu4@gmail.com";
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

async function requireAdmin(req: Request, res: Response) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Sign in required" });
    return false;
  }
  const user = await clerk.users.getUser(auth.userId);
  const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId) ?? user.emailAddresses[0];
  const email = primary?.emailAddress.toLowerCase();
  if (email !== ADMIN_EMAIL || primary?.verification?.status !== "verified") {
    res.status(403).json({ error: "Master admin access required" });
    return false;
  }
  return true;
}

router.get("/admin/integrations/flutterwave", async (req, res, next) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const result = await db.execute(sql`
      SELECT credential_mode, updated_at
      FROM platform_integrations
      WHERE provider = 'flutterwave'
      LIMIT 1
    `);
    const row = result.rows[0] as { credential_mode?: string; updated_at?: string } | undefined;
    res.json({
      connected: Boolean(row) || isFlutterwaveConfigured(),
      mode: row?.credential_mode ?? flutterwaveCredentialMode(),
      updatedAt: row?.updated_at ?? null,
      provider: "flutterwave",
    });
  } catch (error) {
    next(error);
  }
});

router.put("/admin/integrations/flutterwave", async (req, res, next) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
    if (!apiKey || apiKey.length < 20 || apiKey.length > 500) {
      res.status(400).json({ error: "Enter a valid Flutterwave secret API key." });
      return;
    }

    process.env.FLUTTERWAVE_SECRET_KEY = apiKey;
    const connection = await checkFlutterwaveConnection();
    const mode = apiKey.startsWith("FLWSECK_TEST-") ? "test" : apiKey.startsWith("FLWSECK-") ? "live" : "unknown";
    const encrypted = encryptSecret(apiKey);
    await db.execute(sql`
      INSERT INTO platform_integrations (provider, encrypted_secret_key, credential_mode, updated_at)
      VALUES ('flutterwave', ${encrypted}, ${mode}, now())
      ON CONFLICT (provider) DO UPDATE SET
        encrypted_secret_key = EXCLUDED.encrypted_secret_key,
        credential_mode = EXCLUDED.credential_mode,
        updated_at = now()
    `);

    res.json({ connected: true, mode, provider: "flutterwave", status: connection.status, updatedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Flutterwave connection failed";
    res.status(400).json({ error: message });
  }
});

export default router;
