import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requirePermission } from "../lib/tenant-access";
import { hasSelfPurchaseConflict, referralAccountsConflict, isSafeAutomationCount, connectorMayPublish } from "../lib/merchant-abuse-policy";

const router = Router();
const STORE_AUCTION_PROFIT_THRESHOLD = 500_000;

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
    const enabled = body.enabled !== false;
    const approvalPrice = body.requireApprovalForPriceChanges === true;
    const approvalPublish = body.requireApprovalForExternalPublish !== false;
    await db.execute(sql`INSERT INTO merchant_automation_policies (merchant_id, enabled, daily_action_limit, daily_ad_limit, min_margin_percent, max_price_multiplier, require_approval_for_price_changes, require_approval_for_external_publish, updated_at) VALUES (${ctx.merchantId}, ${enabled}, ${dailyActionLimit}, ${dailyAdLimit}, ${minMarginPercent}, ${maxPriceMultiplier}, ${approvalPrice}, ${approvalPublish}, now()) ON CONFLICT (merchant_id) DO UPDATE SET enabled=EXCLUDED.enabled, daily_action_limit=EXCLUDED.daily_action_limit, daily_ad_limit=EXCLUDED.daily_ad_limit, min_margin_percent=EXCLUDED.min_margin_percent, max_price_multiplier=EXCLUDED.max_price_multiplier, require_approval_for_price_changes=EXCLUDED.require_approval_for_price_changes, require_approval_for_external_publish=EXCLUDED.require_approval_for_external_publish, updated_at=now()`);
    res.json({ saved: true });
  } catch (e) { next(e); }
});

router.post("/merchant/security/check-self-purchase", async (req, res) => {
  const conflict = hasSelfPurchaseConflict({ merchantId: Number(req.body?.merchantId), sellerMerchantId: req.body?.sellerMerchantId == null ? null : Number(req.body.sellerMerchantId), buyerMerchantId: req.body?.buyerMerchantId == null ? null : Number(req.body.buyerMerchantId), buyerEmail: req.body?.buyerEmail, sellerEmail: req.body?.sellerEmail });
  res.json({ allowed: !conflict, signal: conflict ? "self_purchase" : null });
});

router.post("/merchant/security/check-referral", async (req, res) => {
  const conflict = referralAccountsConflict({ referrerMerchantId: Number(req.body?.referrerMerchantId), referredMerchantId: Number(req.body?.referredMerchantId), referrerEmail: req.body?.referrerEmail, referredEmail: req.body?.referredEmail });
  res.json({ allowed: !conflict, signal: conflict ? "referral_collision" : null });
});

router.post("/merchant/security/check-connector-publish", async (req, res) => {
  const allowed = connectorMayPublish({ connected: req.body?.connected === true, authorized: req.body?.authorized === true, revoked: req.body?.revoked === true });
  res.json({ allowed, signal: allowed ? null : "connector_not_authorized" });
});

router.get("/merchant/store-auction-eligibility", async (req, res, next) => {
  try {
    const ctx = await merchantContext(req, res); if (!ctx) return;
    const financial = await db.execute(sql`SELECT COALESCE(SUM(CASE WHEN status IN ('provider_confirmed','successful','settled') AND entry_type IN ('sale','profit') THEN amount ELSE 0 END),0) AS verified_profit FROM ledger_entries WHERE merchant_id = ${ctx.merchantId}`);
    const verifiedProfit = Number((financial.rows[0] as { verified_profit?: string } | undefined)?.verified_profit ?? 0);
    const eligible = verifiedProfit >= STORE_AUCTION_PROFIT_THRESHOLD;
    res.json({ eligible, verifiedProfit, requiredVerifiedProfit: STORE_AUCTION_PROFIT_THRESHOLD, source: "Lunavo verified financial ledger" });
  } catch (e) { next(e); }
});

export default router;
