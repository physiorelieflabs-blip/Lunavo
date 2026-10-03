import { Router, type Request, type Response } from "express";
import { getAuth } from "../lib/auth-compat";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router = Router();

async function merchantId(req: Request, res: Response) {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  const result = await db.execute(sql`SELECT id FROM merchants WHERE clerk_user_id=${userId} LIMIT 1`);
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
             (
               COALESCE(SUM(CASE WHEN entry_type IN ('withdrawal_reserve','withdrawal_release','withdrawal_paid') THEN 0 ELSE amount_minor END),0)
               - COALESCE((
                   SELECT SUM(ROUND(CAST(w.amount AS numeric) * 100))
                   FROM withdrawals w
                   WHERE w.merchant_id=ledger_entries.merchant_id
                     AND w.currency=ledger_entries.currency
                     AND w.status='paid'
                 ),0)
             )::bigint AS ledger_balance_minor,
             COALESCE(SUM(CASE WHEN entry_type NOT IN ('withdrawal_reserve','withdrawal_release','withdrawal_paid') AND amount_minor > 0 THEN amount_minor ELSE 0 END),0)::bigint AS credits_minor,
             (
               COALESCE(SUM(CASE WHEN entry_type NOT IN ('withdrawal_reserve','withdrawal_release','withdrawal_paid') AND amount_minor < 0 THEN ABS(amount_minor) ELSE 0 END),0)
               + COALESCE((
                   SELECT SUM(ROUND(CAST(w.amount AS numeric) * 100))
                   FROM withdrawals w
                   WHERE w.merchant_id=ledger_entries.merchant_id
                     AND w.currency=ledger_entries.currency
                     AND w.status='paid'
                 ),0)
             )::bigint AS debits_minor
      FROM ledger_entries
      WHERE merchant_id=${id} ${currency ? sql`AND currency=${currency}` : sql`}
      GROUP BY currency, merchant_id
      ORDER BY currency
    `);
    const holds = await db.execute(sql`
      SELECT currency,
        COALESCE(SUM(ROUND(CAST(amount AS numeric) * 100)),0)::bigint AS withdrawal_hold_minor
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

export default router;
