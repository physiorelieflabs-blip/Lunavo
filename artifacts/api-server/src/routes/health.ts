import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getStoredFlutterwaveCredentials } from "../lib/flutterwave-runtime";

const router: IRouter = Router();

router.get("/readyz", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    const schema = await db.execute(sql`SELECT to_regclass('public.merchants')::text AS merchants, to_regclass('public.local_auth_users')::text AS local_auth_users, to_regclass('public._ts_commerce_migrations')::text AS migrations`);
    const row = schema.rows[0] as { merchants?: string | null; local_auth_users?: string | null; migrations?: string | null } | undefined;
    if (!row?.merchants || !row.local_auth_users || !row.migrations) {
      res.status(503).json({ ready: false, database: true, schema: false, payment: false, reason: "required schema is not initialized" });
      return;
    }
    const migrationCount = await db.execute(sql`SELECT count(*)::int AS count FROM "_ts_commerce_migrations"`);
    const count = Number((migrationCount.rows[0] as { count?: number } | undefined)?.count ?? 0);
    const flutterwave = await getStoredFlutterwaveCredentials();
    const paymentConfigured = Boolean(flutterwave.secretKey && flutterwave.webhookSecret);
    res.json({
      ready: true,
      database: true,
      schema: true,
      migrationsApplied: count,
      payment: paymentConfigured,
      paymentProvider: "flutterwave",
      paymentMode: flutterwave.mode,
      paymentWarning: paymentConfigured ? null : "Flutterwave API and Webhook credentials are not configured; real-money checkout is unavailable.",
    });
  } catch (error) {
    res.status(503).json({ ready: false, database: false, schema: false, payment: false });
  }
});

router.get("/healthz", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json(HealthCheckResponse.parse({ status: "ok" }));
  } catch {
    res.status(503).json(HealthCheckResponse.parse({ status: "database_unavailable" }));
  }
});

export default router;
