import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { requireMasterAdmin } from "../lib/master-admin";

const router = Router();

async function admin(req: Request, res: Response): Promise<string | null> {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  try { await requireMasterAdmin(userId); return userId; }
  catch { res.status(403).json({ error: "Master admin access required" }); return null; }
}

router.get("/admin/financial-trace", async (req, res, next) => {
  const userId = await admin(req, res);
  if (!userId) return;
  const reference = typeof req.query.reference === "string" ? req.query.reference.trim() : "";
  if (!reference || reference.length > 200) { res.status(400).json({ error: "Provide a reference or provider transaction identifier up to 200 characters." }); return; }
  try {
    const pattern = `%${reference}%`;
    const [intents, payments, paymentRecords, ledger, dashboard, reconciliation] = await Promise.all([
      db.execute(sql`SELECT id,merchant_id,order_id,method,status,amount_minor,currency,provider_transaction_id,provider_event_id,evidence_reference,created_at,updated_at FROM payment_intents WHERE reference ILIKE ${pattern} OR evidence_reference ILIKE ${pattern} OR provider_transaction_id ILIKE ${pattern} ORDER BY created_at DESC LIMIT 50`),
      db.execute(sql`SELECT id,merchant_id,amount,currency,method,reference,evidence_reference,provider_transaction_id,provider_event_id,status,reviewed_by,reviewed_at,created_at FROM payments WHERE reference ILIKE ${pattern} OR evidence_reference ILIKE ${pattern} OR provider_transaction_id ILIKE ${pattern} ORDER BY created_at DESC LIMIT 50`),
      db.execute(sql`SELECT id,intent_id,merchant_id,order_id,amount_minor,currency,method,evidence_reference,status,verified_by,verified_at,created_at FROM payment_records WHERE evidence_reference ILIKE ${pattern} ORDER BY created_at DESC LIMIT 50`),
      db.execute(sql`SELECT id,merchant_id,order_id,payment_record_id,withdrawal_id,refund_id,amount_minor,currency,entry_type,reference_key,created_at FROM ledger_entries WHERE reference_key ILIKE ${pattern} ORDER BY created_at DESC LIMIT 100`),
      db.execute(sql`SELECT id,merchant_id,counterparty_merchant_id,transaction_type,transaction_kind,status,verification_state,verified_at,amount_minor,currency,lunavo_fee_minor,provider_fee_minor,merchant_net_minor,provider,provider_reference,internal_reference,source,metadata,created_at,updated_at FROM lunavo_dashboard_transactions WHERE provider_reference ILIKE ${pattern} OR internal_reference ILIKE ${pattern} ORDER BY created_at DESC LIMIT 100`),
      db.execute(sql`SELECT id,provider,event_id,provider_transaction_id,payment_reference,merchant_id,order_id,payment_intent_id,expected_amount_minor,observed_amount_minor,expected_currency,observed_currency,reason,status,created_at,resolved_at,resolved_by FROM payment_reconciliation_exceptions WHERE provider_transaction_id ILIKE ${pattern} OR payment_reference ILIKE ${pattern} ORDER BY created_at DESC LIMIT 100`),
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.json({ reference, searchedBy: userId, trace: { paymentIntents: intents.rows, payments: payments.rows, paymentRecords: paymentRecords.rows, ledgerEntries: ledger.rows, dashboardTransactions: dashboard.rows, reconciliationExceptions: reconciliation.rows }, sourceOfTruth: "TS Pay ledger; dashboard is the persistent read model and trace surface." });
  } catch (error) { next(error); }
});

export default router;
