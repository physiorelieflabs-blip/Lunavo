import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
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
             COALESCE(SUM(amount_minor),0)::bigint AS ledger_balance_minor,
             COALESCE(SUM(CASE WHEN amount_minor > 0 THEN amount_minor ELSE 0 END),0)::bigint AS credits_minor,
             COALESCE(SUM(CASE WHEN amount_minor < 0 THEN ABS(amount_minor) ELSE 0 END),0)::bigint AS debits_minor
      FROM ledger_entries
      WHERE merchant_id=${id} ${currency ? sql`AND currency=${currency}` : sql``}
      GROUP BY currency
      ORDER BY currency
    `);
    const holds = await db.execute(sql`
      SELECT currency,COALESCE(SUM(amount_minor),0)::bigint AS withdrawal_hold_minor
      FROM ledger_entries
      WHERE merchant_id=${id} AND entry_type='withdrawal_reserve'
      GROUP BY currency
    `);
    const holdByCurrency = new Map(holds.rows.map((row: any) => [String(row.currency), Number(row.withdrawal_hold_minor ?? 0)]));
    const balances = balance.rows.map((row: any) => {
      const ledgerBalanceMinor = Number(row.ledger_balance_minor ?? 0);
      const withdrawalHoldMinor = Math.max(0, holdByCurrency.get(String(row.currency)) ?? 0);
      return {
        currency: row.currency,
        ledgerBalanceMinor,
        withdrawalHoldMinor,
        availableBalanceMinor: ledgerBalanceMinor - withdrawalHoldMinor,
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
