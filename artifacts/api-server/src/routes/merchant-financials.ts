import { Router } from "express";
import { getAuth } from "../lib/auth-compat";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

/** TS Pay read model. No client-supplied balance or payout destination is accepted. */
router.get("/merchant/dashboard/balance", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const merchantRows = await db.execute(sql`SELECT id FROM merchants WHERE status='active' AND (clerk_user_id=${userId} OR local_auth_user_id=${userId}) LIMIT 1`);
    const merchantId = Number((merchantRows.rows[0] as {id?:number}|undefined)?.id);
    if (!Number.isInteger(merchantId)) { res.status(404).json({ error: "Merchant account not found" }); return; }
    const rows = await db.execute(sql`
      SELECT currency,
        COALESCE(SUM(amount_minor),0)::bigint AS ledger_balance_minor,
        COALESCE(SUM(CASE WHEN entry_type='withdrawal_reserve' THEN amount_minor ELSE 0 END),0)::bigint AS withdrawal_hold_minor,
        COALESCE(SUM(CASE WHEN entry_type='withdrawal_paid' THEN -amount_minor ELSE 0 END),0)::bigint AS paid_withdrawal_minor,
        COALESCE(SUM(CASE WHEN entry_type IN ('sale','internal_transfer_in') AND amount_minor>0 THEN amount_minor ELSE 0 END),0)::bigint AS credits_minor,
        COALESCE(SUM(CASE WHEN entry_type='fee' THEN -amount_minor ELSE 0 END),0)::bigint AS fees_minor,
        COALESCE(SUM(CASE WHEN entry_type='refund' THEN -amount_minor ELSE 0 END),0)::bigint AS refunds_minor
      FROM ledger_entries WHERE merchant_id=${merchantId} GROUP BY currency ORDER BY currency
    `);
    const earnings = await db.execute(sql`
      SELECT currency,COALESCE(SUM(ROUND(CAST(earnings_held AS numeric) * 100)),0)::bigint AS earnings_held_minor
      FROM subscriptions WHERE merchant_id=${merchantId} AND CAST(earnings_held AS numeric)>0 GROUP BY currency
    `);
    const earningsByCurrency=new Map(earnings.rows.map((row:any)=>[String(row.currency),Math.max(0,Number(row.earnings_held_minor??0))]));
    const balances=(rows.rows as Array<Record<string,unknown>>).map(r=>{
      const ledger=Number(r.ledger_balance_minor??0), hold=Math.max(0,Number(r.withdrawal_hold_minor??0)), earningsHeld=earningsByCurrency.get(String(r.currency))??0;
      return {currency:String(r.currency),balanceMinor:ledger,availableBalanceMinor:Math.max(0,ledger-hold-earningsHeld),reservedWithdrawalMinor:hold,earningsHeldMinor:earningsHeld,paidWithdrawalMinor:Math.max(0,Number(r.paid_withdrawal_minor??0)),creditsMinor:Number(r.credits_minor??0),feesMinor:Number(r.fees_minor??0),refundsMinor:Number(r.refunds_minor??0)};
    });
    res.json({sourceOfTruth:"TS Pay ledger",isExternalBankAccount:false,merchantId,balances});
  } catch(error) { req.log.error({err:error},"Failed to read TS Pay merchant balance"); res.status(500).json({error:"Merchant balance could not be loaded"}); }
});

export default router;
