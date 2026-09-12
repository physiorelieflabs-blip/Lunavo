import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

/**
 * TS Pay balance read model. The ledger is authoritative: clients cannot set
 * balances, earnings, holds, or available amounts through this endpoint.
 */
router.get("/merchant/dashboard/balance", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const merchantRows = await db.execute(sql`
      SELECT id
      FROM merchants
      WHERE clerk_user_id = ${auth.userId}
      LIMIT 1
    `);
    const merchant = merchantRows.rows[0] as { id?: number } | undefined;
    if (!merchant?.id) {
      res.status(404).json({ error: "Merchant account not found" });
      return;
    }

    const rows = await db.execute(sql`
      SELECT
        currency,
        COALESCE(SUM(amount_minor), 0)::bigint AS balance_minor,
        COALESCE(SUM(CASE WHEN entry_type = 'withdrawal_reserve' THEN -amount_minor ELSE 0 END), 0)::bigint AS reserved_withdrawal_minor,
        COALESCE(SUM(CASE WHEN entry_type IN ('sale','adjustment') AND amount_minor > 0 THEN amount_minor ELSE 0 END), 0)::bigint AS gross_credits_minor,
        COALESCE(SUM(CASE WHEN entry_type = 'fee' THEN -amount_minor ELSE 0 END), 0)::bigint AS fees_minor,
        COALESCE(SUM(CASE WHEN entry_type = 'refund' THEN -amount_minor ELSE 0 END), 0)::bigint AS refunds_minor
      FROM ledger_entries
      WHERE merchant_id = ${merchant.id}
      GROUP BY currency
      ORDER BY currency
    `);

    const balances = (rows.rows as Array<Record<string, unknown>>).map((row) => ({
      currency: String(row.currency),
      balanceMinor: Number(row.balance_minor ?? 0),
      availableBalanceMinor: Number(row.balance_minor ?? 0),
      reservedWithdrawalMinor: Number(row.reserved_withdrawal_minor ?? 0),
      grossCreditsMinor: Number(row.gross_credits_minor ?? 0),
      feesMinor: Number(row.fees_minor ?? 0),
      refundsMinor: Number(row.refunds_minor ?? 0),
    }));

    res.json({
      sourceOfTruth: "TS Pay ledger",
      isExternalBankAccount: false,
      merchantId: merchant.id,
      balances,
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to read TS Pay merchant balance");
    res.status(500).json({ error: "Merchant balance could not be loaded" });
  }
});

export default router;
