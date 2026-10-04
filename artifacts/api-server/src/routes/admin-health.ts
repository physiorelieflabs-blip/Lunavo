import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { requireMasterAdmin } from "../lib/master-admin";
import { getStoredFlutterwaveCredentials } from "../lib/flutterwave-runtime";

const router = Router();

async function admin(req: Request, res: Response): Promise<string | null> {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  try { await requireMasterAdmin(userId); return userId; }
  catch { res.status(403).json({ error: "Master admin access required" }); return null; }
}

router.get("/admin/system/health", async (req, res, next) => {
  const userId = await admin(req, res);
  if (!userId) return;
  try {
    await db.execute(sql`SELECT 1`);
    const schemaResult = await db.execute(sql`
      SELECT
        to_regclass('public.merchants')::text AS merchants,
        to_regclass('public.local_auth_users')::text AS local_auth_users,
        to_regclass('public.ledger_entries')::text AS ledger_entries,
        to_regclass('public.lunavo_dashboard_transactions')::text AS dashboard_transactions,
        to_regclass('public.domain_events')::text AS domain_events,
        to_regclass('public.social_publish_jobs')::text AS social_publish_jobs,
        to_regclass('public.admin_ai_store_jobs')::text AS admin_ai_store_jobs
    `);
    const migrationsResult = await db.execute(sql`SELECT count(*)::int AS count FROM "_ts_commerce_migrations"`);
    const reconciliationResult = await db.execute(sql`SELECT count(*)::int AS count FROM payment_reconciliation_exceptions WHERE status IN ('open','investigating')`);
    const socialQueuedResult = await db.execute(sql`SELECT count(*)::int AS count FROM social_publish_jobs WHERE status IN ('queued','processing')`);
    const socialFailedResult = await db.execute(sql`SELECT count(*)::int AS count FROM social_publish_jobs WHERE status='failed'`);
    const aiQueuedResult = await db.execute(sql`SELECT count(*)::int AS count FROM admin_ai_store_jobs WHERE status IN ('queued','researching','building')`);
    const aiFailedResult = await db.execute(sql`SELECT count(*)::int AS count FROM admin_ai_store_jobs WHERE status='failed'`);
    const eventsPendingResult = await db.execute(sql`SELECT count(*)::int AS count FROM domain_events WHERE status IN ('pending','processing')`);
    const eventsFailedResult = await db.execute(sql`SELECT count(*)::int AS count FROM domain_events WHERE status='failed'`);
    const flutterwave = await getStoredFlutterwaveCredentials();
    const schema = schemaResult.rows[0] as Record<string, string | null> | undefined;
    const number = (result: { rows: unknown[] }) => Number((result.rows[0] as { count?: number } | undefined)?.count ?? 0);
    const requiredSchema = [schema?.merchants, schema?.local_auth_users, schema?.ledger_entries, schema?.dashboard_transactions, schema?.domain_events, schema?.social_publish_jobs, schema?.admin_ai_store_jobs].every(Boolean);
    const aiConfigured = Boolean(process.env.LUNAVO_LOCAL_LLM_URL?.trim());
    res.setHeader("Cache-Control", "no-store");
    res.json({
      checkedAt: new Date().toISOString(), checkedBy: userId,
      database: { reachable: true },
      schema: { complete: requiredSchema },
      migrations: { applied: number(migrationsResult) },
      payments: { provider: "flutterwave", configured: Boolean(flutterwave.secretKey && flutterwave.webhookSecret), mode: flutterwave.mode, checkoutAvailable: Boolean(flutterwave.secretKey && flutterwave.webhookSecret) },
      ai: { providerConfigured: aiConfigured, localLlmConfigured: Boolean(process.env.LUNAVO_LOCAL_LLM_URL?.trim()), mode: "self-hosted" },
      reconciliation: { openOrInvestigating: number(reconciliationResult) },
      workers: {
        socialPublishing: { queuedOrProcessing: number(socialQueuedResult), failed: number(socialFailedResult) },
        adminAiStore: { queuedOrProcessing: number(aiQueuedResult), failed: number(aiFailedResult) },
        domainEvents: { pendingOrProcessing: number(eventsPendingResult), failed: number(eventsFailedResult) },
      },
      notes: [
        "Worker counts are observed queue state, not a fabricated process-heartbeat claim.",
        "Payment readiness requires both Flutterwave API and webhook credentials; configuration alone never implies a successful payment.",
        "Core AI readiness uses only the configured self-hosted inference endpoint; hosted AI credentials are not accepted by core."
      ],
    });
  } catch (error) { next(error); }
});

export default router;
