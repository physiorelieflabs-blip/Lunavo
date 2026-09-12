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
    const result = await db.execute(sql`
      SELECT id,transaction_type,status,amount_minor,currency,lunavo_fee_minor,provider_fee_minor,merchant_net_minor,provider,provider_reference,internal_reference,source,metadata,created_at,updated_at
      FROM lunavo_dashboard_transactions
      WHERE merchant_id=${id}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    res.json({ transactions: result.rows, sourceOfTruth: "TS Pay ledger + verified provider settlement", message: "All displayed financial transactions are controlled by Lunavo's payment boundary; this dashboard is a read model, not an external bank account." });
  } catch (e) { next(e); }
});

export default router;
