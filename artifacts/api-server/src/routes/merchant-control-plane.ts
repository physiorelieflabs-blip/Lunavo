import { Router, type Request, type Response } from "express";
import { getAuth } from "../lib/auth-compat";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requirePermission } from "../lib/tenant-access";
import { isSafeAutomationCount } from "../lib/merchant-abuse-policy";

const router = Router();
const STORE_AUCTION_PROFIT_THRESHOLD_MINOR = 50_000_000;

async function merchantContext(req: Request, res: Response) {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  const result = await db.execute(sql`SELECT id FROM merchants WHERE clerk_user_id = ${userId} LIMIT 1`);
  const merchantId = Number((result.rows[0] as { id?: number } | undefined)?.id);
  if (!Number.isInteger(merchantId)) { res.status(404).json({ error: "Merchant workspace not found" }); return null; }
  try { await requirePermission(userId, merchantId, "team.manage"); } catch { res.status(403).json({ error: "Permission required" }); return null; }
  return { userId, merchantId };
}

router.get("/merchant/automation-policy", async (req, res, next) => {
  try {
    const ctx = await merchantContext(req, res); if (!ctx) return;
    const result = await db.execute(sql`SELECT * FROM merchant_automation_policies WHERE merchant_id = ${ctx.merchantId}`);
    const row = result.rows[0] ?? null;
    res.json({ policy: row ?? { merchant_id: ctx.merchantId, enabled: true, daily_action_limit: 500, daily_ad_limit: 3, min_margin_percent: 15, max_price_multiplier: 3, require_approval_for_price_changes: false, require_approval_for_external_publish: true } });
  } catch (e) { next(e); }
});

router.put("/merchant/automation-policy", async (req, res, next) => {
  try {
    const ctx = await merchantContext(req, res); if (!ctx) return;
    const body = req.body ?? {};
    const dailyActionLimit = Number(body.dailyActionLimit ?? 500);
    const dailyAdLimit = Number(body.dailyAdLimit ?? 3);
    const minMarginPercent = Number(body.minMarginPercent ?? 15);
    const maxPriceMultiplier = Number(body.maxPriceMultiplier ?? 3);
    if (!isSafeAutomationCount(dailyActionLimit) || !Number.isInteger(dailyAdLimit) || dailyAdLimit < 0 || dailyAdLimit > 100 || !Number.isFinite(minMarginPercent) || minMarginPercent < 0 || minMarginPercent > 100 || !Number.isFinite(maxPriceMultiplier) || maxPriceMultiplier <= 0 || maxPriceMultiplier > 100) {
      res.status(400).json({ error: "Invalid automation limits" }); return;
    }
    await db.execute(sql`INSERT INTO merchant_automation_policies (merchant_id, enabled, daily_action_limit, daily_ad_limit, min_margin_percent, max_price_multiplier, require_approval_for_price_changes, require_approval_for_external_publish, updated_at) VALUES (${ctx.merchantId}, ${body.enabled !== false}, ${dailyActionLimit}, ${dailyAdLimit}, ${minMarginPercent}, ${maxPriceMultiplier}, ${body.requireApprovalForPriceChanges === true}, ${body.requireApprovalForExternalPublish !== false}, now()) ON CONFLICT (merchant_id) DO UPDATE SET enabled=EXCLUDED.enabled, daily_action_limit=EXCLUDED.daily_action_limit, daily_ad_limit=EXCLUDED.daily_ad_limit, min_margin_percent=EXCLUDED.min_margin_percent, max_price_multiplier=EXCLUDED.max_price_multiplier, require_approval_for_price_changes=EXCLUDED.require_approval_for_price_changes, require_approval_for_external_publish=EXCLUDED.require_approval_for_external_publish, updated_at=now()`);
    res.json({ saved: true });
  } catch (e) { next(e); }
});

router.put("/merchant/autopilot/mode", async (req, res, next) => {
  try {
    const ctx = await merchantContext(req, res); if (!ctx) return;
    const level = Number(req.body?.autonomyLevel);
    const trainingOptIn = Boolean(req.body?.trainingOptIn);
    if (!Number.isInteger(level) || level < 0 || level > 4) return res.status(400).json({ error: "Invalid Autopilot level" });
    if (level === 4 && !trainingOptIn) return res.status(400).json({ error: "Full Autopilot requires local AI training consent" });
    const rawGoal = req.body?.goal;
    const goal = rawGoal == null ? null : typeof rawGoal === "string" ? rawGoal.trim().slice(0, 180) : "";
    if (rawGoal != null && !goal) return res.status(400).json({ error: "Autopilot goal must be a non-empty string when provided" });
    const rawGoalTarget = req.body?.goalTarget;
    const goalTarget = rawGoalTarget == null ? null : Number(rawGoalTarget);
    if (goalTarget !== null && (!Number.isFinite(goalTarget) || goalTarget < 0 || goalTarget > 1_000_000_000)) return res.status(400).json({ error: "Autopilot goal target is invalid" });
    const rawGoal = req.body?.goal;
    const goal = rawGoal == null ? null : typeof rawGoal === "string" ? rawGoal.trim().slice(0, 180) : "";
    if (rawGoal != null && !goal) return res.status(400).json({ error: "Autopilot goal must be a non-empty string when provided" });
    const rawGoalTarget = req.body?.goalTarget;
    const goalTarget = rawGoalTarget == null ? null : Number(rawGoalTarget);
    if (goalTarget !== null && (!Number.isFinite(goalTarget) || goalTarget < 0 || goalTarget > 1_000_000_000)) return res.status(400).json({ error: "Autopilot goal target is invalid" });
    const result = await db.transaction(async (tx): Promise<{ settings: any; policy: any }> => {
      await tx.execute(sql`INSERT INTO ai_settings (merchant_id,autonomy_level,run_my_business,training_opt_in,goal,goal_target)
        VALUES (${ctx.merchantId},${level},${level === 4},${trainingOptIn},${goal},${goalTarget === null ? null : goalTarget.toFixed(2)})
        ON CONFLICT (merchant_id) DO UPDATE SET autonomy_level=EXCLUDED.autonomy_level,run_my_business=EXCLUDED.run_my_business,training_opt_in=EXCLUDED.training_opt_in,goal=EXCLUDED.goal,goal_target=EXCLUDED.goal_target,updated_at=now()`);
      await tx.execute(sql`INSERT INTO merchant_automation_policies (merchant_id,enabled,daily_action_limit,daily_ad_limit,min_margin_percent,max_price_multiplier,require_approval_for_price_changes,require_approval_for_external_publish,updated_at)
        VALUES (${ctx.merchantId},${level !== 0},500,3,15,3,false,true,now())
        ON CONFLICT (merchant_id) DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=now()`);
      const settings = (await tx.execute(sql`SELECT autonomy_level,run_my_business,training_opt_in,goal,goal_target FROM ai_settings WHERE merchant_id=${ctx.merchantId} LIMIT 1`)).rows[0];
      const policy = (await tx.execute(sql`SELECT merchant_id,enabled,daily_action_limit,daily_ad_limit,min_margin_percent,max_price_multiplier,require_approval_for_price_changes,require_approval_for_external_publish FROM merchant_automation_policies WHERE merchant_id=${ctx.merchantId} LIMIT 1`)).rows[0];
      return { settings, policy };
    });
    res.json({ settings: result.settings, policy: result.policy });
  } catch (e) { next(e); }
});

router.post("/merchant/autopilot/emergency-stop", async (req, res, next) => {
  try {
    const ctx = await merchantContext(req, res); if (!ctx) return;
    await db.transaction(async (tx) => {
      await tx.execute(sql`INSERT INTO merchant_automation_policies (merchant_id,enabled,daily_action_limit,daily_ad_limit,min_margin_percent,max_price_multiplier,require_approval_for_price_changes,require_approval_for_external_publish,updated_at)
        VALUES (${ctx.merchantId},false,0,0,0,1,true,true,now())
        ON CONFLICT (merchant_id) DO UPDATE SET enabled=false,require_approval_for_price_changes=true,require_approval_for_external_publish=true,updated_at=now()`);
      await tx.execute(sql`UPDATE ai_settings SET run_my_business=false,autonomy_level=0,updated_at=now() WHERE merchant_id=${ctx.merchantId}`);
      await tx.execute(sql`INSERT INTO merchant_automation_audit (merchant_id,action_type,status,idempotency_key,reason,metadata)
        VALUES (${ctx.merchantId},'autopilot_emergency_stop','blocked',${'autopilot-emergency-stop:' + ctx.merchantId + ':' + new Date().toISOString()},'Merchant emergency stop activated',{\"source\":\"autopilot_control_centre\"}::jsonb)`);
    });
    res.json({ stopped:true, message:"Autopilot and RUN MY BUSINESS have been disabled for this merchant. Approval requirements were re-enabled." });
  } catch (e) { next(e); }
});

router.get("/merchant/store-auction-eligibility", async (req, res, next) => {
  try {
    const ctx = await merchantContext(req, res); if (!ctx) return;
    const financial = await db.execute(sql`SELECT COALESCE(verified_profit_minor, 0) AS verified_profit_minor, currency FROM merchant_verified_financials WHERE merchant_id = ${ctx.merchantId} AND currency = 'USD' LIMIT 1`);
    const row = financial.rows[0] as { verified_profit_minor?: string; currency?: string } | undefined;
    const verifiedProfitMinor = Number(row?.verified_profit_minor ?? 0);
    const eligible = Number.isSafeInteger(verifiedProfitMinor) && verifiedProfitMinor >= STORE_AUCTION_PROFIT_THRESHOLD_MINOR;
    res.json({ eligible, verifiedProfitUsd: verifiedProfitMinor / 100, requiredVerifiedProfitUsd: 500_000, source: "Lunavo verified financial records", clientSuppliedProfitIgnored: true });
  } catch (e) { next(e); }
});

export default router;
