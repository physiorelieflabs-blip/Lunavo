import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
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
