import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { requireMasterAdmin } from "../lib/master-admin";
import { getStoredFlutterwaveCredentials } from "../lib/flutterwave-runtime";
import { getLocalAiPool } from "../lib/ai-provider";

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
        to_regclass('public.admin_ai_store_jobs')::text AS admin_ai_store_jobs,
        to_regclass('public.merchant_automation_workflows')::text AS merchant_automation_workflows,
        to_regclass('public.merchant_automation_runs')::text AS merchant_automation_runs,
        to_regclass('public.customer_subscriptions')::text AS customer_subscriptions,
        to_regclass('public.market_fx_rate_snapshots')::text AS fx_snapshots
    `);
    const migrationsResult = await db.execute(sql`SELECT count(*)::int AS count FROM "_ts_commerce_migrations"`);
    const reconciliationResult = await db.execute(sql`SELECT count(*)::int AS count FROM payment_reconciliation_exceptions WHERE status IN ('open','investigating')`);
    const socialQueuedResult = await db.execute(sql`SELECT count(*)::int AS count FROM social_publish_jobs WHERE status IN ('queued','processing')`);
    const socialFailedResult = await db.execute(sql`SELECT count(*)::int AS count FROM social_publish_jobs WHERE status='failed'`);
    const aiQueuedResult = await db.execute(sql`SELECT count(*)::int AS count FROM admin_ai_store_jobs WHERE status IN ('queued','researching','building')`);
    const workflowQueuedResult = await db.execute(sql`SELECT count(*)::int AS count FROM merchant_automation_runs WHERE status IN ('running','approval_required')`);
    const subscriptionDueResult = await db.execute(sql`SELECT count(*)::int AS count FROM customer_subscriptions WHERE status IN ('active','past_due') AND next_charge_at<=now()`);
    const supplierSyncResult = await db.execute(sql`SELECT count(*) FILTER (WHERE import_status='source_unavailable')::int AS unavailable, count(*) FILTER (WHERE source_metadata->'supplierSync'->>'state'='failed')::int AS failed, count(*) FILTER (WHERE source_metadata->'supplierSync'->>'state'='syncing' AND last_attempted_sync < now() - interval '20 minutes')::int AS stale_claims FROM supplier_products WHERE inventory_strategy='synchronized' AND status='active' AND visibility='active'`);
    const fxSnapshotResult = await db.execute(sql`SELECT fetched_at, source_summary, jsonb_object_length(rates_per_usd)::int AS currency_count FROM market_fx_rate_snapshots ORDER BY fetched_at DESC, id DESC LIMIT 1`);
    const aiFailedResult = await db.execute(sql`SELECT count(*)::int AS count FROM admin_ai_store_jobs WHERE status='failed'`);
    const eventsPendingResult = await db.execute(sql`SELECT count(*)::int AS count FROM domain_events WHERE status IN ('pending','processing')`);
    const eventsRetryResult = await db.execute(sql`SELECT count(*)::int AS count FROM domain_events WHERE status='retry'`);
    const eventsFailedResult = await db.execute(sql`SELECT count(*)::int AS count FROM domain_events WHERE status IN ('failed','dead_letter')`);
    const flutterwave = await getStoredFlutterwaveCredentials();
    const schema = schemaResult.rows[0] as Record<string, string | null> | undefined;
    const number = (result: { rows: unknown[] }) => Number((result.rows[0] as { count?: number } | undefined)?.count ?? 0);
    const requiredSchema = [schema?.merchants, schema?.local_auth_users, schema?.ledger_entries, schema?.dashboard_transactions, schema?.domain_events, schema?.social_publish_jobs, schema?.admin_ai_store_jobs, schema?.merchant_automation_workflows, schema?.merchant_automation_runs, schema?.customer_subscriptions, schema?.fx_snapshots].every(Boolean);
    let localAiPool: Awaited<ReturnType<typeof getLocalAiPool>> = [];
    let localAiConfigurationValid = true;
    try { localAiPool = await getLocalAiPool(); }
    catch { localAiConfigurationValid = false; }
    const aiConfigured = localAiPool.length > 0;
    const localVisionConfigured = localAiPool.some((item) => item.role === "vision" || item.role === undefined);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      checkedAt: new Date().toISOString(), checkedBy: userId,
      database: { reachable: true },
      schema: { complete: requiredSchema },
      migrations: { applied: number(migrationsResult) },
      payments: { provider: "flutterwave", configured: Boolean(flutterwave.secretKey && flutterwave.webhookSecret), mode: flutterwave.mode, checkoutAvailable: Boolean(flutterwave.secretKey && flutterwave.webhookSecret) },
      ai: { providerConfigured: aiConfigured, localLlmConfigured: aiConfigured, localLlmPoolSize: localAiPool.length, localLlmRoles: [...new Set(localAiPool.map((item) => item.role ?? "general"))], localAiConfigurationValid, localVisionConfigured, localImageConfigured: Boolean(process.env.LUNAVO_LOCAL_IMAGE_URL?.trim()) },
      fxRates: (() => { const row = fxSnapshotResult.rows[0] as { fetched_at?: Date | string; source_summary?: string; currency_count?: number } | undefined; const date = row?.fetched_at instanceof Date ? row.fetched_at : row?.fetched_at ? new Date(row.fetched_at) : null; const fetchedAt = date && Number.isFinite(date.getTime()) ? date.toISOString() : null; const ageMinutes = fetchedAt ? Math.max(0, Math.round((Date.now() - Date.parse(fetchedAt)) / 60000)) : null; return { available: Boolean(fetchedAt), stale: ageMinutes === null || ageMinutes > 360, latestFetchedAt: fetchedAt, ageMinutes, currencyCount: Number(row?.currency_count ?? 0), sources: row?.source_summary ?? null }; })(),
      reconciliation: { openOrInvestigating: number(reconciliationResult) },
      workers: {
        socialPublishing: { queuedOrProcessing: number(socialQueuedResult), failed: number(socialFailedResult) },
        adminAiStore: { queuedOrProcessing: number(aiQueuedResult), failed: number(aiFailedResult) },
        automation: { runningOrAwaitingApproval: number(workflowQueuedResult) },
        customerSubscriptions: { dueForRenewal: number(subscriptionDueResult) },
        domainEvents: { pendingOrProcessing: number(eventsPendingResult), retryWaiting: number(eventsRetryResult), deadLetteredOrFailed: number(eventsFailedResult) }, supplierSync: (() => { const row = supplierSyncResult.rows[0] as { unavailable?: number; failed?: number; stale_claims?: number } | undefined; return { unavailable: Number(row?.unavailable ?? 0), failed: Number(row?.failed ?? 0), staleClaims: Number(row?.stale_claims ?? 0) }; })(),
      },
      notes: [
        "Worker counts are observed queue state, not a fabricated process-heartbeat claim.",
        "Payment readiness requires both Flutterwave API and webhook credentials; configuration alone never implies a successful payment.",
      ],
    });
  } catch (error) { next(error); }
});

export default router;
