import { Router } from "express";
import { getAuth } from "@clerk/express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { buildTsPayLedgerPostings, tsPayAmountMinor, tsPayReferenceKey, validateTsPayReplay, validateTsPayTransfer } from "../lib/ts-pay-ledger";

const router = Router();

router.post("/merchant/ts-pay/transfers", async (req, res, next) => {
  try {
    const userId = getAuth(req).userId;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    const source = await db.execute(sql`SELECT id FROM merchants WHERE clerk_user_id=${userId} LIMIT 1`);
    const fromMerchantId = Number((source.rows[0] as { id?: number } | undefined)?.id);
    if (!Number.isInteger(fromMerchantId)) return res.status(404).json({ error: "Merchant workspace not found" });

    const requestedDestination = typeof req.body?.toAccountNumber === "string" ? req.body.toAccountNumber.trim().toUpperCase() : "";
    const requestedMerchantId = Number(req.body?.toMerchantId);
    const amount = Number(req.body?.amount);
    const currency = typeof req.body?.currency === "string" ? req.body.currency.trim().toUpperCase() : "";
    const note = req.body?.note == null ? null : String(req.body.note).trim().slice(0, 500);
    const headerKey = req.header("Idempotency-Key");
    const bodyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey.trim() : "";
    const idempotencyKey = (typeof headerKey === "string" ? headerKey.trim() : "") || bodyKey;
    if (!idempotencyKey || idempotencyKey.length > 200) return res.status(400).json({ error: "A valid idempotency key is required" });
    if (requestedDestination && !/^TS[A-Z0-9]{16}$/.test(requestedDestination)) return res.status(400).json({ error: "Invalid TS Pay destination account number" });

    const amountMinor = tsPayAmountMinor(amount);
    const referenceKey = tsPayReferenceKey(fromMerchantId, idempotencyKey);
    const destination = requestedDestination
      ? await db.execute(sql`SELECT merchant_id,currency,status,account_number FROM ts_pay_accounts WHERE account_number=${requestedDestination} LIMIT 1`)
      : await db.execute(sql`SELECT merchant_id,currency,status,account_number FROM ts_pay_accounts WHERE merchant_id=${requestedMerchantId} LIMIT 1`);
    const to = destination.rows[0] as { merchant_id:number; currency:string; status:string; account_number:string } | undefined;
    const toMerchantId = Number(to?.merchant_id);
    if (!to || !Number.isInteger(toMerchantId) || toMerchantId <= 0) return res.status(404).json({ error: "TS Pay destination account not found" });
    if (toMerchantId === fromMerchantId) return res.status(400).json({ error: "TS Pay transfers require two different merchant accounts" });

    const sourceAccount = await db.execute(sql`SELECT merchant_id,currency,status,account_number FROM ts_pay_accounts WHERE merchant_id=${fromMerchantId} LIMIT 1`);
    const from = sourceAccount.rows[0] as { merchant_id:number; currency:string; status:string; account_number:string } | undefined;
    if (!from || from.status !== "active" || to.status !== "active") return res.status(400).json({ error: "Both TS Pay accounts must be active" });

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM merchants WHERE id=${fromMerchantId} FOR UPDATE`);
      const existing = await tx.execute(sql`SELECT id,to_merchant_id,amount_minor,currency,note,status,reference_key,ledger_out_reference,ledger_in_reference FROM ts_pay_transfers WHERE from_merchant_id=${fromMerchantId} AND idempotency_key=${idempotencyKey} LIMIT 1`);
      const existingRow = existing.rows[0] as any;
      if (existingRow) {
        validateTsPayReplay({ existingToMerchantId:Number(existingRow.to_merchant_id), existingAmountMinor:Number(existingRow.amount_minor), existingCurrency:String(existingRow.currency), existingNote:existingRow.note == null ? null : String(existingRow.note), requestedToMerchantId:toMerchantId, requestedAmountMinor:amountMinor, requestedCurrency:currency, requestedNote:note });
        return { replay:true, row:existingRow };
      }
      const balance = await tx.execute(sql`SELECT COALESCE(SUM(amount_minor),0)::bigint AS available_minor FROM ledger_entries WHERE merchant_id=${fromMerchantId} AND currency=${String(from.currency).trim().toUpperCase()}`);
      const availableMinor = Number((balance.rows[0] as { available_minor?: string|number } | undefined)?.available_minor ?? 0);
      validateTsPayTransfer({ fromMerchantId, toMerchantId, fromCurrency:String(from.currency), toCurrency:String(to.currency), requestedCurrency:currency, amountMinor, availableMinor });
      const postings = buildTsPayLedgerPostings({ fromMerchantId, toMerchantId, amountMinor, currency, referenceKey });
      const inserted = await tx.execute(sql`INSERT INTO ts_pay_transfers (from_merchant_id,to_merchant_id,amount_minor,currency,status,reference_key,idempotency_key,note,created_by,completed_at,ledger_out_reference,ledger_in_reference) VALUES (${fromMerchantId},${toMerchantId},${amountMinor},${currency},'completed',${referenceKey},${idempotencyKey},${note},${userId},now(),${postings[0].referenceKey},${postings[1].referenceKey}) RETURNING id,to_merchant_id,amount_minor,currency,status,reference_key,ledger_out_reference,ledger_in_reference,created_at,completed_at`);
      await tx.execute(sql`INSERT INTO ledger_entries (merchant_id,amount_minor,currency,entry_type,reference_key) VALUES (${postings[0].merchantId},${postings[0].amountMinor},${postings[0].currency},${postings[0].entryType},${postings[0].referenceKey}), (${postings[1].merchantId},${postings[1].amountMinor},${postings[1].currency},${postings[1].entryType},${postings[1].referenceKey})`);
      return { replay:false, row:inserted.rows[0] };
    });
    return res.status(result.replay ? 200 : 201).json({ transfer:result.row, replayed:result.replay, sourceOfTruth:"TS Pay ledger", message:"Transfer recorded through Lunavo's dashboard control plane." });
  } catch (error) { return next(error); }
});

router.get("/merchant/ts-pay/transfers", async (req, res, next) => {
  try {
    const userId = getAuth(req).userId;
    if (!userId) return res.status(401).json({ error:"Authentication required" });
    const merchant = await db.execute(sql`SELECT id FROM merchants WHERE clerk_user_id=${userId} LIMIT 1`);
    const merchantId = Number((merchant.rows[0] as { id?: number } | undefined)?.id);
    if (!Number.isInteger(merchantId)) return res.status(404).json({ error:"Merchant workspace not found" });
    const result = await db.execute(sql`SELECT id,from_merchant_id,to_merchant_id,amount_minor,currency,status,reference_key,note,created_at,completed_at FROM ts_pay_transfers WHERE from_merchant_id=${merchantId} OR to_merchant_id=${merchantId} ORDER BY created_at DESC LIMIT 100`);
    return res.json({ transfers:result.rows, sourceOfTruth:"TS Pay ledger" });
  } catch (error) { return next(error); }
});

export default router;
