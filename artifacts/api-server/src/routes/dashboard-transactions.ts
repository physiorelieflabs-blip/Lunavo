import { Router, type Request, type Response } from "express";
import { getAuth } from "../lib/auth-compat";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireMasterAdmin } from "../lib/master-admin";

const router = Router();

async function merchantId(req: Request, res: Response) {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  const result = await db.execute(sql`SELECT id FROM merchants WHERE status='active' AND (clerk_user_id=${userId} OR local_auth_user_id=${userId}) LIMIT 1`);
  const id = Number((result.rows[0] as { id?: number } | undefined)?.id);
  if (!Number.isInteger(id)) { res.status(404).json({ error: "Merchant workspace not found" }); return null; }
  return id;
}

/** Single dashboard read model for financial activity. It is not a second wallet. */
router.get("/merchant/dashboard/transactions", async (req, res, next) => {
  try {
    const id = await merchantId(req, res); if (!id) return;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50) || 50));
    const currency = typeof req.query.currency === "string" ? req.query.currency.trim().toUpperCase() : "";
    if (currency && !/^[A-Z]{3}$/.test(currency)) { res.status(400).json({ error: "Currency must be a 3-letter ISO code" }); return; }
    const result = await db.execute(sql`
      SELECT id,transaction_type,transaction_kind,status,verification_state,verified_at,
             amount_minor,currency,lunavo_fee_minor,provider_fee_minor,merchant_net_minor,
             provider,provider_reference,internal_reference,source,metadata,created_at,updated_at
      FROM lunavo_dashboard_transactions
      WHERE merchant_id=${id} ${currency ? sql`AND currency=${currency}` : sql``}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    // Balances are calculated from the immutable ledger rather than trusting
    // client-supplied or dashboard-stored balances. Pending withdrawal holds
    // are subtracted from the ledger total to produce available earnings.
    const balance = await db.execute(sql`
      SELECT currency,
             COALESCE(SUM(CASE WHEN entry_type NOT IN ('withdrawal_reserve','withdrawal_release') THEN amount_minor ELSE 0 END),0)::bigint AS ledger_balance_minor,
             COALESCE(SUM(CASE WHEN entry_type NOT IN ('withdrawal_reserve','withdrawal_release') AND amount_minor > 0 THEN amount_minor ELSE 0 END),0)::bigint AS credits_minor,
             COALESCE(SUM(CASE WHEN entry_type NOT IN ('withdrawal_reserve','withdrawal_release') AND amount_minor < 0 THEN ABS(amount_minor) ELSE 0 END),0)::bigint AS debits_minor
      FROM ledger_entries
      WHERE merchant_id=${id} ${currency ? sql`AND currency=${currency}` : sql``}
      GROUP BY currency
      ORDER BY currency
    `);
    const holds = await db.execute(sql`
      SELECT currency,
        COALESCE(SUM(ROUND(CAST(amount AS numeric)*100)),0)::bigint AS withdrawal_hold_minor
      FROM withdrawals
      WHERE merchant_id=${id} AND status IN ('pending','approved')
      GROUP BY currency
    `);
    const earnings = await db.execute(sql`
      SELECT currency,
        COALESCE(SUM(ROUND(CAST(earnings_held AS numeric) * 100)),0)::bigint AS earnings_held_minor
      FROM subscriptions
      WHERE merchant_id=${id} AND CAST(earnings_held AS numeric)>0
      GROUP BY currency
    `);
    const holdByCurrency = new Map(holds.rows.map((row: any) => [String(row.currency), Math.max(0, Number(row.withdrawal_hold_minor ?? 0))]));
    const earningsByCurrency = new Map(earnings.rows.map((row: any) => [String(row.currency), Math.max(0, Number(row.earnings_held_minor ?? 0))]));
    const balances = balance.rows.map((row: any) => {
      const ledgerBalanceMinor = Number(row.ledger_balance_minor ?? 0);
      const withdrawalHoldMinor = holdByCurrency.get(String(row.currency)) ?? 0;
      const earningsHeldMinor = earningsByCurrency.get(String(row.currency)) ?? 0;
      return {
        currency: row.currency,
        ledgerBalanceMinor,
        withdrawalHoldMinor,
        earningsHeldMinor,
        availableBalanceMinor: Math.max(0, ledgerBalanceMinor - withdrawalHoldMinor - earningsHeldMinor),
        creditsMinor: Number(row.credits_minor ?? 0),
        debitsMinor: Number(row.debits_minor ?? 0),
      };
    });

    res.json({
      transactions: result.rows,
      balances,
      sourceOfTruth: "TS Pay ledger + verified provider settlement",
      message: "All displayed financial transactions are controlled by Lunavo's payment boundary; this dashboard is a read model, not an external bank account.",
    });
  } catch (e) { next(e); }
});


/**
 * Platform-wide financial activity feed for Master Admin. It is read-only:
 * payment authority remains with verified provider transactions and the
 * immutable ledger. This endpoint never creates or settles money.
 */
router.get("/admin/dashboard/transactions", async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    await requireMasterAdmin(userId);
  } catch {
    res.status(403).json({ error: "Master Admin access with MFA is required" });
    return;
  }

  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 100) || 100));
  const currency = typeof req.query.currency === "string" ? req.query.currency.trim().toUpperCase() : "";
  const status = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "";
  const verificationState = typeof req.query.verificationState === "string" ? req.query.verificationState.trim().toLowerCase() : "";
  const hasMerchantFilter = req.query.merchantId !== undefined;
  const merchantId = hasMerchantFilter ? Number(req.query.merchantId) : 0;
  if (currency && !/^[A-Z]{3}$/.test(currency)) { res.status(400).json({ error: "Currency must be a 3-letter ISO code" }); return; }
  if (status && !/^[a-z_]{1,40}$/.test(status)) { res.status(400).json({ error: "Invalid transaction status filter" }); return; }
  if (verificationState && !["unverified", "verified", "reversed", "reconciliation_required"].includes(verificationState)) {
    res.status(400).json({ error: "Invalid verification state filter" }); return;
  }
  if (hasMerchantFilter && (!Number.isSafeInteger(merchantId) || merchantId < 1)) {
    res.status(400).json({ error: "Merchant ID must be a positive integer" }); return;
  }

  try {
    const rows = await db.execute(sql`
      SELECT t.id,t.merchant_id,m.name AS merchant_name,m.email AS merchant_email,
             t.transaction_type,t.transaction_kind,t.status,t.verification_state,t.verified_at,
             t.amount_minor,t.currency,t.lunavo_fee_minor,t.provider_fee_minor,t.merchant_net_minor,
             t.provider,t.provider_reference,t.internal_reference,t.idempotency_key,t.source,
             t.created_at,t.updated_at
      FROM lunavo_dashboard_transactions t
      LEFT JOIN merchants m ON m.id=t.merchant_id
      WHERE (${currency ? sql`t.currency=${currency}` : sql`true`})
        AND (${status ? sql`t.status=${status}` : sql`true`})
        AND (${verificationState ? sql`t.verification_state=${verificationState}` : sql`true`})
        AND (${merchantId ? sql`t.merchant_id=${merchantId}` : sql`true`})
      ORDER BY
        CASE WHEN t.verification_state='reconciliation_required' THEN 0 ELSE 1 END,
        t.created_at DESC
      LIMIT ${limit}
    `);
    const summary = await db.execute(sql`
      SELECT currency,
        COUNT(*)::bigint AS transaction_count,
        COUNT(*) FILTER (WHERE status IN ('pending','reconciliation_required') OR verification_state IN ('unverified','reconciliation_required'))::bigint AS attention_count,
        COUNT(*) FILTER (WHERE status='confirmed' AND verification_state='verified')::bigint AS verified_count,
        COUNT(*) FILTER (WHERE status IN ('failed','reversed','disputed') OR verification_state='reversed')::bigint AS exception_count
      FROM lunavo_dashboard_transactions
      WHERE (${currency ? sql`currency=${currency}` : sql`true`})
        AND (${merchantId ? sql`merchant_id=${merchantId}` : sql`true`})
      GROUP BY currency ORDER BY currency
    `);
    const pendingWithdrawals = await db.execute(sql`
      SELECT w.id,w.merchant_id,m.name AS merchant_name,m.email AS merchant_email,
             w.amount,w.currency,w.status,w.payout_provider,w.provider_status,w.created_at,
             w.reviewed_at,w.settled_at,w.paid_at
      FROM withdrawals w
      INNER JOIN merchants m ON m.id=w.merchant_id
      WHERE w.status IN ('pending','approved')
        AND (${currency ? sql`w.currency=${currency}` : sql`true`})
        AND (${merchantId ? sql`w.merchant_id=${merchantId}` : sql`true`})
      ORDER BY w.created_at ASC
      LIMIT ${limit}
    `);
    res.json({
      transactions: rows.rows,
      summary: summary.rows,
      pendingWithdrawals: pendingWithdrawals.rows,
      sourceOfTruth: "immutable TS Pay ledger + provider-verified dashboard projection",
      moneyMovement: "read_only",
      message: "Provider settlement and payout confirmation are authoritative. Dashboard rows never by themselves confirm external funds movement.",
    });
  } catch (error) { next(error); }
});


export default router;
