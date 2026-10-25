import { Router, type Request, type Response } from "express";
import { getAuth } from "../lib/auth-compat";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireMasterAdmin } from "../lib/master-admin";
import { flutterwaveAmount, flutterwaveStatus, flutterwaveTransactionId, verifyFlutterwaveTransaction } from "../lib/flutterwave-client";
import { merchantFundReleaseVerificationFailure } from "../lib/merchant-fund-release-policy";
import { currencyMinorDigits, toMinorUnits } from "../lib/money";

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
        AND (${status ? sql`status=${status}` : sql`true`})
        AND (${verificationState ? sql`verification_state=${verificationState}` : sql`true`})
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
    const pendingPaymentIntents = await db.execute(sql`
      SELECT p.id,p.merchant_id,m.name AS merchant_name,m.email AS merchant_email,
             p.order_id,p.amount_minor,p.currency,p.settlement_amount_minor,p.settlement_currency,
             p.method,p.status,p.evidence_reference,p.provider_transaction_id,p.provider_event_id,
             p.created_at,p.updated_at
      FROM payment_intents p
      INNER JOIN merchants m ON m.id=p.merchant_id
      WHERE p.status NOT IN ('successful','verified','failed','cancelled','expired','refunded','reversed')
        AND (${currency ? sql`p.currency=${currency}` : sql`true`})
        AND (${merchantId ? sql`p.merchant_id=${merchantId}` : sql`true`})
      ORDER BY p.created_at ASC
      LIMIT ${limit}
    `);
    const pendingFundReleases = await db.execute(sql`
      SELECT r.id,r.merchant_id,m.name AS merchant_name,m.email AS merchant_email,
             r.source_type,r.source_reference,r.payment_intent_id,r.order_id,r.payment_record_id,
             r.provider,r.provider_transaction_id,r.provider_reference,r.provider_amount_minor,r.provider_currency,
             r.provider_fee_evidence_minor,r.amount_minor,r.currency,r.invoice_id,r.legacy_hold,r.held_amount_minor,
             r.legacy_provider_fee_posted_minor,r.legacy_lunavo_fee_posted_minor,
             r.provider_fee_minor,r.lunavo_fee_minor,r.merchant_net_minor,r.status,r.review_note,r.created_at
      FROM merchant_fund_release_reviews r
      INNER JOIN merchants m ON m.id=r.merchant_id
      WHERE r.status IN ('pending','reconciliation_required')
        AND (${currency ? sql`r.currency=${currency}` : sql`true`})
        AND (${merchantId ? sql`r.merchant_id=${merchantId}` : sql`true`})
      ORDER BY CASE WHEN r.status='reconciliation_required' THEN 0 ELSE 1 END, r.created_at ASC
      LIMIT ${limit}
    `);
    const openReconciliationExceptions = await db.execute(sql`
      SELECT e.id,e.provider,e.event_id,e.provider_transaction_id,e.payment_reference,
             e.merchant_id,m.name AS merchant_name,e.order_id,e.payment_intent_id,
             e.expected_amount_minor,e.observed_amount_minor,e.expected_currency,
             e.observed_currency,e.reason,e.status,e.created_at
      FROM payment_reconciliation_exceptions e
      LEFT JOIN merchants m ON m.id=e.merchant_id
      WHERE e.resolved_at IS NULL
        AND e.status NOT IN ('resolved','closed','dismissed')
        AND (${currency ? sql`(upper(e.expected_currency)=${currency} OR upper(e.observed_currency)=${currency})` : sql`true`})
        AND (${merchantId ? sql`e.merchant_id=${merchantId}` : sql`true`})
      ORDER BY e.created_at ASC
      LIMIT ${limit}
    `);
    res.json({
      transactions: rows.rows,
      summary: summary.rows,
      pendingWithdrawals: pendingWithdrawals.rows,
      pendingPaymentIntents: pendingPaymentIntents.rows,
      pendingFundReleases: pendingFundReleases.rows,
      openReconciliationExceptions: openReconciliationExceptions.rows,
      sourceOfTruth: "immutable TS Pay ledger + provider-verified dashboard projection",
      moneyMovement: "read_only",
      message: "Provider settlement and payout confirmation are authoritative. Dashboard rows never by themselves confirm external funds movement.",
    });
  } catch (error) { next(error); }
});


/**
 * Releases verified merchant proceeds only after a fresh Flutterwave re-query
 * and a second, locked check of internal payment state. All ledger postings and
 * the review decision commit atomically; retries cannot pay the same proceeds twice.
 */
/**
 * Safely returns a quarantined proceeds row to the pending queue only after a
 * fresh provider re-query and locked confirmation of its internal source.
 * This route never posts a ledger entry; a second explicit release action is required.
 */
/**
 * Manual receipt release requires an explicit Master Admin attestation that
 * actual money was independently observed in the platform's bank/provider
 * statement. Merchant-submitted receipts alone are never enough.
 */
router.post("/admin/dashboard/fund-releases/:id/manual-release", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    await requireMasterAdmin(userId);
  } catch {
    res.status(403).json({ error: "Master Admin access with MFA is required" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Invalid fund-release review id" }); return; }
  const externalReference = typeof req.body?.externalReference === "string" ? req.body.externalReference.trim().slice(0,200) : "";
  const reviewNote = typeof req.body?.reviewNote === "string" ? req.body.reviewNote.trim().slice(0,500) : "";
  if (req.body?.verifiedFundsReceived !== true || externalReference.length < 4 || reviewNote.length < 30) {
    res.status(400).json({ error: "Confirm funds received, enter an external bank/provider statement reference, and provide a review note of at least 30 characters." });
    return;
  }

  const initialResult = await db.execute(sql`
    SELECT id,merchant_id,source_type,source_reference,payment_intent_id,order_id,invoice_id,payment_record_id,
           provider,provider_transaction_id,provider_reference,provider_amount_minor,provider_currency,
           provider_fee_evidence_minor,amount_minor,currency,legacy_hold,held_amount_minor,
           legacy_provider_fee_posted_minor,legacy_lunavo_fee_posted_minor,
           provider_fee_minor,lunavo_fee_minor,merchant_net_minor,status,review_note
    FROM merchant_fund_release_reviews WHERE id=${id} LIMIT 1
  `);
  const initial = initialResult.rows[0] as Record<string, any> | undefined;
  if (!initial) { res.status(404).json({ error: "Fund-release review not found" }); return; }
  if (String(initial.status) === "released") {
    res.json({ id,status:"released",replayed:true,message:"These proceeds were already released." });
    return;
  }
  if (String(initial.provider) !== "manual_evidence" ||
      !["order_payment","invoice_payment"].includes(String(initial.source_type))) {
    res.status(409).json({ error: "Only manually submitted order/invoice receipt evidence can use this attestation route." });
    return;
  }
  if (String(initial.status) !== "reconciliation_required") {
    res.status(409).json({ error: "Manual receipt must remain quarantined until explicit Admin attestation." });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (initial.payment_intent_id != null) {
        await tx.execute(sql`SELECT id FROM payment_intents WHERE id=${Number(initial.payment_intent_id)} FOR UPDATE`);
      }
      const lockedResult = await tx.execute(sql`
        SELECT id,merchant_id,source_type,source_reference,payment_intent_id,order_id,invoice_id,payment_record_id,
               provider,provider_transaction_id,provider_reference,provider_amount_minor,provider_currency,
               provider_fee_evidence_minor,amount_minor,currency,legacy_hold,held_amount_minor,
               legacy_provider_fee_posted_minor,legacy_lunavo_fee_posted_minor,
               provider_fee_minor,lunavo_fee_minor,merchant_net_minor,status,review_note
        FROM merchant_fund_release_reviews WHERE id=${id} FOR UPDATE
      `);
      const row = lockedResult.rows[0] as Record<string, any> | undefined;
      if (!row) return { outcome:"missing" as const };
      if (String(row.status) === "released") return { outcome:"replay" as const };
      if (String(row.status) !== "reconciliation_required" || String(row.provider) !== "manual_evidence") {
        return { outcome:"blocked" as const, reason:"The row is no longer a quarantined manual receipt." };
      }
      const block = async (reason:string) => {
        await tx.execute(sql`
          INSERT INTO audit_logs (
            user_id,merchant_id,action,resource_type,resource_id,changes,
            ip_address,user_agent,status,created_at
          ) VALUES (
            ${userId},${String(row.merchant_id)},'manual_funds_release_blocked','merchant_fund_release_review',
            ${String(id)},${JSON.stringify({reason,sourceReference:String(row.source_reference)})}::jsonb,
            ${req.ip ?? null},${req.get("user-agent")?.slice(0,500) ?? null},'success',now()
          )
        `);
        return { outcome:"blocked" as const, reason };
      };
      if (!["order_payment","invoice_payment"].includes(String(row.source_type))) return await block("Unsupported manual receipt source.");
      const intentResult = await tx.execute(sql`
        SELECT id,status,merchant_id,order_id FROM payment_intents
        WHERE id=${Number(row.payment_intent_id)} AND merchant_id=${Number(row.merchant_id)} LIMIT 1
      `);
      const intent = intentResult.rows[0] as Record<string, any> | undefined;
      if (!intent || !["verified","successful"].includes(String(intent.status))) {
        return await block("The underlying payment intent is not in a verified state.");
      }
      const recordResult = await tx.execute(sql`
        SELECT id,status FROM payment_records
        WHERE id=${Number(row.payment_record_id)} AND intent_id=${Number(row.payment_intent_id)}
          AND merchant_id=${Number(row.merchant_id)} LIMIT 1
      `);
      const record = recordResult.rows[0] as Record<string, any> | undefined;
      if (!record || !["verified","successful"].includes(String(record.status))) {
        return await block("The payment evidence record is missing or not verified.");
      }
      if (String(row.source_type) === "order_payment") {
        const orderResult = await tx.execute(sql`
          SELECT id,status FROM orders WHERE id=${Number(row.order_id)}
            AND merchant_id=${Number(row.merchant_id)} LIMIT 1 FOR UPDATE
        `);
        const order = orderResult.rows[0] as Record<string, any> | undefined;
        if (!order || !["paid","fulfilled","cancelled"].includes(String(order.status))) {
          return await block("The associated order is not in a verified payment state.");
        }
      } else {
        const invoiceResult = await tx.execute(sql`
          SELECT id,status FROM invoices WHERE id=${Number(row.invoice_id)}
            AND merchant_id=${Number(row.merchant_id)} LIMIT 1 FOR UPDATE
        `);
        const invoice = invoiceResult.rows[0] as Record<string, any> | undefined;
        if (!invoice || !["paid","partially_paid"].includes(String(invoice.status))) {
          return await block("The associated invoice is not in a paid/partially-paid state.");
        }
      }
      const exceptionResult = await tx.execute(sql`
        SELECT id FROM payment_reconciliation_exceptions
        WHERE payment_intent_id=${Number(row.payment_intent_id)}
          AND resolved_at IS NULL AND status NOT IN ('resolved','closed','dismissed') LIMIT 1
      `);
      if (exceptionResult.rows.length) return await block("An unresolved payment exception prevents release.");
      const heldAmount = Number(row.held_amount_minor ?? 0);
      const gross = Number(row.amount_minor);
      const providerFee = Number(row.provider_fee_minor);
      const lunavoFee = Number(row.lunavo_fee_minor);
      const net = Number(row.merchant_net_minor);
      const missingProviderFee = providerFee - Number(row.legacy_provider_fee_posted_minor ?? 0);
      const missingLunavoFee = lunavoFee - Number(row.legacy_lunavo_fee_posted_minor ?? 0);
      if (!Number.isSafeInteger(gross) || gross <= 0 || !Number.isSafeInteger(net) || net < 0 ||
          providerFee < 0 || lunavoFee < 0 || gross - providerFee - lunavoFee !== net) {
        return await block("Gross, fees, and merchant net do not reconcile.");
      }
      if (Boolean(row.legacy_hold) &&
          (!Number.isSafeInteger(heldAmount) || heldAmount < net || missingProviderFee < 0 || missingLunavoFee < 0)) {
        return await block("Historic frozen proceeds/fee postings do not reconcile. Finance must resolve the row.");
      }

      const reopened = await tx.execute(sql`
        UPDATE merchant_fund_release_reviews SET status='pending',reviewed_at=NULL,reviewed_by=NULL
        WHERE id=${id} AND status='reconciliation_required' RETURNING id
      `);
      if (!reopened.rows.length) return { outcome:"replay" as const };
      const finalized = await tx.execute(sql`
        UPDATE merchant_fund_release_reviews
        SET status='released',reviewed_at=now(),reviewed_by=${userId},
            review_note=${(reviewNote + " [External receipt reference: " + externalReference + "]").slice(0,700)}
        WHERE id=${id} AND status='pending' RETURNING id
      `);
      if (!finalized.rows.length) return { outcome:"replay" as const };

      if (Boolean(row.legacy_hold)) {
        if (heldAmount > 0) await tx.execute(sql`
          INSERT INTO ledger_entries (merchant_id,order_id,invoice_id,payment_record_id,amount_minor,currency,entry_type,reference_key)
          VALUES (${Number(row.merchant_id)},${row.order_id == null ? null : Number(row.order_id)},
                  ${row.invoice_id == null ? null : Number(row.invoice_id)},${row.payment_record_id == null ? null : Number(row.payment_record_id)},
                  ${heldAmount},${String(row.currency).toUpperCase()},'merchant_funds_release',
                  ${"merchant-fund-release:legacy-release:" + String(row.source_reference)})
          ON CONFLICT (reference_key) DO NOTHING
        `);
        if (missingProviderFee > 0) await tx.execute(sql`
          INSERT INTO ledger_entries (merchant_id,order_id,invoice_id,payment_record_id,amount_minor,currency,entry_type,reference_key)
          VALUES (${Number(row.merchant_id)},${row.order_id == null ? null : Number(row.order_id)},
                  ${row.invoice_id == null ? null : Number(row.invoice_id)},${row.payment_record_id == null ? null : Number(row.payment_record_id)},
                  ${-missingProviderFee},${String(row.currency).toUpperCase()},'fee',${"merchant-fund-release:legacy-provider-fee:" + String(row.source_reference)})
          ON CONFLICT (reference_key) DO NOTHING
        `);
        if (missingLunavoFee > 0) await tx.execute(sql`
          INSERT INTO ledger_entries (merchant_id,order_id,invoice_id,payment_record_id,amount_minor,currency,entry_type,reference_key)
          VALUES (${Number(row.merchant_id)},${row.order_id == null ? null : Number(row.order_id)},
                  ${row.invoice_id == null ? null : Number(row.invoice_id)},${row.payment_record_id == null ? null : Number(row.payment_record_id)},
                  ${-missingLunavoFee},${String(row.currency).toUpperCase()},'fee',${"merchant-fund-release:legacy-lunavo-fee:" + String(row.source_reference)})
          ON CONFLICT (reference_key) DO NOTHING
        `);
      } else {
        await tx.execute(sql`
          INSERT INTO ledger_entries (merchant_id,order_id,invoice_id,payment_record_id,amount_minor,currency,entry_type,reference_key)
          VALUES (${Number(row.merchant_id)},${row.order_id == null ? null : Number(row.order_id)},
                  ${row.invoice_id == null ? null : Number(row.invoice_id)},${row.payment_record_id == null ? null : Number(row.payment_record_id)},
                  ${gross},${String(row.currency).toUpperCase()},'sale',${String(row.source_reference)+":released-sale"})
          ON CONFLICT (reference_key) DO NOTHING
        `);
        if (providerFee > 0) await tx.execute(sql`
          INSERT INTO ledger_entries (merchant_id,order_id,invoice_id,payment_record_id,amount_minor,currency,entry_type,reference_key)
          VALUES (${Number(row.merchant_id)},${row.order_id == null ? null : Number(row.order_id)},
                  ${row.invoice_id == null ? null : Number(row.invoice_id)},${row.payment_record_id == null ? null : Number(row.payment_record_id)},
                  ${-providerFee},${String(row.currency).toUpperCase()},'fee',${String(row.source_reference)+":released-provider-fee"})
          ON CONFLICT (reference_key) DO NOTHING
        `);
        if (lunavoFee > 0) await tx.execute(sql`
          INSERT INTO ledger_entries (merchant_id,order_id,invoice_id,payment_record_id,amount_minor,currency,entry_type,reference_key)
          VALUES (${Number(row.merchant_id)},${row.order_id == null ? null : Number(row.order_id)},
                  ${row.invoice_id == null ? null : Number(row.invoice_id)},${row.payment_record_id == null ? null : Number(row.payment_record_id)},
                  ${-lunavoFee},${String(row.currency).toUpperCase()},'fee',${String(row.source_reference)+":released-lunavo-fee"})
          ON CONFLICT (reference_key) DO NOTHING
        `);
      }
      await tx.execute(sql`
        INSERT INTO audit_logs (
          user_id,merchant_id,action,resource_type,resource_id,changes,
          ip_address,user_agent,status,created_at
        ) VALUES (
          ${userId},${String(row.merchant_id)},'manual_funds_received_and_released','merchant_fund_release_review',
          ${String(id)},${JSON.stringify({
            sourceType:String(row.source_type),sourceReference:String(row.source_reference),
            merchantGrossMinor:gross,currency:String(row.currency).toUpperCase(),
            merchantNetMinor:net,externalReference,reviewNote,legacyHold:Boolean(row.legacy_hold),
            attestation:"Master Admin independently confirmed funds received in external bank/provider statement"
          })}::jsonb,${req.ip ?? null},${req.get("user-agent")?.slice(0,500) ?? null},'success',now()
        )
      `);
      return { outcome:"released" as const };
    });
    if (result.outcome === "missing") { res.status(404).json({ error:"Fund-release review not found" }); return; }
    if (result.outcome === "blocked") { res.status(409).json({ error:result.reason+" Proceeds remain locked." }); return; }
    if (result.outcome === "replay") { res.json({ id,status:"released",replayed:true }); return; }
    res.json({ id,status:"released",replayed:false,message:"Manual receipt attestation was recorded and the proceeds were released to TS Pay ledger." });
  } catch (error) {
    req.log.error({ err:error,fundReleaseId:id },"Manual merchant receipt release failed");
    res.status(500).json({ error:"Manual proceeds were not released. Check the audit trail before retrying." });
  }
});

router.post("/admin/dashboard/fund-releases/:id/recheck", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    await requireMasterAdmin(userId);
  } catch {
    res.status(403).json({ error: "Master Admin access with MFA is required" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Invalid fund-release review id" }); return; }
  const reviewResult = await db.execute(sql`
    SELECT id,merchant_id,source_type,source_reference,payment_intent_id,order_id,invoice_id,payment_record_id,
           provider,provider_transaction_id,provider_reference,provider_amount_minor,provider_currency,
           provider_fee_evidence_minor,amount_minor,currency,invoice_id,legacy_hold,held_amount_minor,
           legacy_provider_fee_posted_minor,legacy_lunavo_fee_posted_minor,
           provider_fee_minor,lunavo_fee_minor,merchant_net_minor,status,review_note
    FROM merchant_fund_release_reviews WHERE id=${id} LIMIT 1
  `);
  const review = reviewResult.rows[0] as Record<string, any> | undefined;
  if (!review) { res.status(404).json({ error: "Fund-release review not found" }); return; }
  if (String(review.status) === "pending") {
    res.json({ id, status: "pending", replayed: true, message: "The row is already back in the release queue; no money moved." });
    return;
  }
  if (String(review.status) !== "reconciliation_required") {
    res.status(409).json({ error: "Only a reconciliation-required proceeds row can be rechecked." });
    return;
  }
  if (String(review.provider) !== "flutterwave" || !String(review.provider_transaction_id ?? "")) {
    res.status(409).json({ error: "The release row has no valid supported provider transaction." });
    return;
  }

  let verified: Record<string, any>;
  try {
    verified = await verifyFlutterwaveTransaction(String(review.provider_transaction_id)) as unknown as Record<string, any>;
  } catch (error) {
    req.log.warn({ err: error, fundReleaseId: id }, "Flutterwave recheck failed for quarantined merchant proceeds");
    res.status(502).json({ error: "Flutterwave could not re-verify this payment. It remains quarantined." });
    return;
  }
  const observedId = flutterwaveTransactionId(verified as any);
  const observedCurrency = String(verified.currency ?? "").trim().toUpperCase();
  const observedAmountMinor = toMinorUnits(flutterwaveAmount(verified as any), currencyMinorDigits(observedCurrency));
  const observedReference = String(verified.tx_ref ?? verified.reference ?? "").trim();
  const refundStatus = String(verified.refund_status ?? "").trim().toLowerCase();
  const disputeStatus = String(verified.dispute_status ?? "").trim().toLowerCase();
  const observedProviderFee = verified.app_fee == null || verified.app_fee === "" ? null : toMinorUnits(Number(verified.app_fee), currencyMinorDigits(observedCurrency));
  const providerFeeMinor = Number(review.provider_fee_minor);
  const amountMinor = Number(review.amount_minor);
  const providerAmountMinor = Number(review.provider_amount_minor);
  const providerCurrency = String(review.provider_currency).toUpperCase();
  const providerFeeEvidenceMinor = review.provider_fee_evidence_minor == null ? null : Number(review.provider_fee_evidence_minor);
  const lunavoFeeMinor = Number(review.lunavo_fee_minor);
  const merchantNetMinor = Number(review.merchant_net_minor);
  const reversalOrDispute = ["successful","processed","refunded","completed"].includes(refundStatus) ||
    ["chargeback","charged_back","reversed","open","active","disputed"].includes(disputeStatus);
  const failure = merchantFundReleaseVerificationFailure({
    providerPaid: flutterwaveStatus(verified as any) === "paid",
    reversalOrDispute,
    observedTransactionId: observedId || null,
    expectedTransactionId: String(review.provider_transaction_id),
    observedAmountMinor,
    expectedAmountMinor: providerAmountMinor,
    observedCurrency,
    expectedCurrency: providerCurrency,
    observedReference,
    expectedReference: review.provider_reference == null ? null : String(review.provider_reference),
    observedProviderFeeMinor: observedProviderFee,
    expectedProviderFeeMinor: providerFeeMinor,
    expectedProviderFeeEvidenceMinor: providerFeeEvidenceMinor,
    expectedMerchantGrossMinor: amountMinor,
    expectedMerchantCurrency: String(review.currency).toUpperCase(),
    expectedLunavoFeeMinor: lunavoFeeMinor,
    expectedMerchantNetMinor: merchantNetMinor,
  });
  if (failure) {
    await db.execute(sql`
      INSERT INTO audit_logs (
        user_id,merchant_id,action,resource_type,resource_id,changes,
        ip_address,user_agent,status,created_at
      ) VALUES (
        ${userId},${String(review.merchant_id)},'merchant_funds_release_recheck_blocked','merchant_fund_release_review',
        ${String(id)},${JSON.stringify({reason:failure,sourceReference:String(review.source_reference)})}::jsonb,
        ${req.ip ?? null},${req.get("user-agent")?.slice(0,500) ?? null},'success',now()
      )
    `);
    res.status(409).json({ error: failure + " The row remains quarantined; no money moved." });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Payment workflows lock the payment intent before the release review.
      // Keep the same order here to avoid webhook/refund/admin deadlocks.
      if (String(review.source_type) === "order_payment" && review.payment_intent_id != null) {
        await tx.execute(sql`SELECT id FROM payment_intents WHERE id=${Number(review.payment_intent_id)} FOR UPDATE`);
      }
      const lockedResult = await tx.execute(sql`
        SELECT id,merchant_id,source_type,source_reference,payment_intent_id,order_id,invoice_id,payment_record_id,
               provider,provider_transaction_id,provider_reference,provider_amount_minor,provider_currency,
               provider_fee_evidence_minor,amount_minor,currency,legacy_hold,held_amount_minor,
               legacy_provider_fee_posted_minor,legacy_lunavo_fee_posted_minor,
               provider_fee_minor,lunavo_fee_minor,merchant_net_minor,status,review_note
        FROM merchant_fund_release_reviews WHERE id=${id} FOR UPDATE
      `);
      const row = lockedResult.rows[0] as Record<string, any> | undefined;
      if (!row) return { outcome: "missing" as const };
      if (String(row.status) === "pending") return { outcome: "pending" as const };
      if (String(row.status) !== "reconciliation_required") return { outcome: "blocked" as const, reason: "The proceeds row is no longer quarantined." };
      const block = async (reason: string) => {
        await tx.execute(sql`
          INSERT INTO audit_logs (
            user_id,merchant_id,action,resource_type,resource_id,changes,
            ip_address,user_agent,status,created_at
          ) VALUES (
            ${userId},${String(row.merchant_id)},'merchant_funds_release_recheck_blocked','merchant_fund_release_review',
            ${String(id)},${JSON.stringify({reason,sourceReference:String(row.source_reference)})}::jsonb,
            ${req.ip ?? null},${req.get("user-agent")?.slice(0,500) ?? null},'success',now()
          )
        `);
        return { outcome: "blocked" as const, reason };
      };

      if (String(row.source_type) === "order_payment") {
        const intentResult = await tx.execute(sql`
          SELECT id,status,provider_transaction_id,order_id,merchant_id
          FROM payment_intents WHERE id=${Number(row.payment_intent_id)} FOR UPDATE
        `);
        const intent = intentResult.rows[0] as Record<string, any> | undefined;
        if (!intent || String(intent.status) !== "successful" ||
            String(intent.provider_transaction_id ?? "") !== String(row.provider_transaction_id) ||
            Number(intent.order_id) !== Number(row.order_id) ||
            Number(intent.merchant_id) !== Number(row.merchant_id)) {
          return await block("The underlying payment intent is not in a matching successful state.");
        }
        const exceptionResult = await tx.execute(sql`
          SELECT id FROM payment_reconciliation_exceptions
          WHERE payment_intent_id=${Number(row.payment_intent_id)}
            AND resolved_at IS NULL AND status NOT IN ('resolved','closed','dismissed')
          LIMIT 1
        `);
        if (exceptionResult.rows.length) return await block("An unresolved payment reconciliation exception prevents reopening.");
        const recordResult = await tx.execute(sql`
          SELECT id,status FROM payment_records
          WHERE id=${Number(row.payment_record_id)} AND intent_id=${Number(row.payment_intent_id)}
          LIMIT 1 FOR UPDATE
        `);
        const record = recordResult.rows[0] as Record<string, any> | undefined;
        if (!record || String(record.status) !== "successful") {
          return await block("The verified payment record is missing or no longer successful.");
        }
        const orderResult = await tx.execute(sql`
          SELECT id,status FROM orders
          WHERE id=${Number(row.order_id)} AND merchant_id=${Number(row.merchant_id)}
          LIMIT 1 FOR UPDATE
        `);
        const order = orderResult.rows[0] as Record<string, any> | undefined;
        if (!order || String(order.status) !== "paid") return await block("The associated order is not in paid status.");
      } else if (String(row.source_type) === "invoice_payment") {
        const invoiceResult = await tx.execute(sql`
          SELECT id,status,merchant_id FROM invoices WHERE id=${Number(row.invoice_id)}
            AND merchant_id=${Number(row.merchant_id)} LIMIT 1
        `);
        const invoice = invoiceResult.rows[0] as Record<string, any> | undefined;
        if (!invoice || !["paid","partially_paid"].includes(String(invoice.status))) return await block("The invoice is not paid or partially paid.");
        const intentResult = await tx.execute(sql`
          SELECT id,status,provider_transaction_id,merchant_id FROM payment_intents
          WHERE id=${Number(row.payment_intent_id)} AND merchant_id=${Number(row.merchant_id)} LIMIT 1
        `);
        const intent = intentResult.rows[0] as Record<string, any> | undefined;
        if (!intent || !["successful","verified"].includes(String(intent.status)) ||
            String(intent.provider_transaction_id ?? "") !== String(row.provider_transaction_id)) return await block("The online invoice payment intent does not match provider evidence.");
        const recordResult = await tx.execute(sql`
          SELECT id,status FROM payment_records WHERE id=${Number(row.payment_record_id)}
            AND intent_id=${Number(row.payment_intent_id)} AND merchant_id=${Number(row.merchant_id)} LIMIT 1
        `);
        const record = recordResult.rows[0] as Record<string, any> | undefined;
        if (!record || !["successful","verified"].includes(String(record.status))) return await block("The invoice payment record is missing or unverified.");
        const exceptionResult = await tx.execute(sql`
          SELECT id FROM payment_reconciliation_exceptions WHERE payment_intent_id=${Number(row.payment_intent_id)}
            AND resolved_at IS NULL AND status NOT IN ('resolved','closed','dismissed') LIMIT 1
        `);
        if (exceptionResult.rows.length) return await block("An unresolved invoice payment exception prevents reopening.");
      } else if (String(row.source_type) === "store_auction") {
        const evidence = await tx.execute(sql`
          SELECT id FROM store_auction_payment_verifications
          WHERE provider='flutterwave' AND provider_reference=${String(row.provider_reference ?? "")}
            AND status='verified' LIMIT 1
        `);
        if (!evidence.rows.length) return await block("Verified store-auction settlement evidence is missing.");
      } else if (String(row.source_type) === "product_auction") {
        const evidence = await tx.execute(sql`
          SELECT id FROM product_auction_settlements
          WHERE provider_transaction_id=${String(row.provider_transaction_id)}
            AND status='paid' LIMIT 1
        `);
        if (!evidence.rows.length) return await block("Verified product-auction settlement evidence is missing.");
      } else {
        return await block("Unsupported fund-release source type.");
      }

      if (Boolean(row.legacy_hold)) {
        const held = Number(row.held_amount_minor ?? 0);
        if (!Number.isSafeInteger(held) || held < Number(row.merchant_net_minor) ||
            Number(row.legacy_provider_fee_posted_minor ?? 0) > Number(row.provider_fee_minor) ||
            Number(row.legacy_lunavo_fee_posted_minor ?? 0) > Number(row.lunavo_fee_minor)) {
          return await block("Historic ledger amount or fee postings do not reconcile; Finance review required.");
        }
      }
      const reopened = await tx.execute(sql`
        UPDATE merchant_fund_release_reviews
        SET status='pending',reviewed_at=NULL,reviewed_by=NULL,
            review_note='Reopened after fresh provider and internal-state verification'
        WHERE id=${id} AND status='reconciliation_required' RETURNING id
      `);
      if (!reopened.rows.length) return { outcome: "pending" as const };
      await tx.execute(sql`
        INSERT INTO audit_logs (
          user_id,merchant_id,action,resource_type,resource_id,changes,
          ip_address,user_agent,status,created_at
        ) VALUES (
          ${userId},${String(row.merchant_id)},'merchant_funds_release_reopened','merchant_fund_release_review',
          ${String(id)},${JSON.stringify({
            sourceType:String(row.source_type),sourceReference:String(row.source_reference),
            providerTransactionId:String(row.provider_transaction_id),
            previousReviewNote:row.review_note ?? null, legacyHold:Boolean(row.legacy_hold)
          })}::jsonb,${req.ip ?? null},${req.get("user-agent")?.slice(0,500) ?? null},'success',now()
        )
      `);
      return { outcome: "reopened" as const };
    });
    if (result.outcome === "missing") { res.status(404).json({ error: "Fund-release review not found" }); return; }
    if (result.outcome === "blocked") { res.status(409).json({ error: result.reason + " The row remains quarantined." }); return; }
    res.json({ id, status: "pending", replayed: result.outcome === "pending", message: "Fresh provider/internal checks passed. Proceeds are back in the release queue but no money moved; use Release proceeds separately." });
  } catch (error) {
    req.log.error({ err: error, fundReleaseId: id }, "Failed to recheck quarantined merchant proceeds");
    res.status(500).json({ error: "The proceeds row was not reopened. Check the audit trail before retrying." });
  }
});

router.post("/admin/dashboard/fund-releases/:id/release", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    await requireMasterAdmin(userId);
  } catch {
    res.status(403).json({ error: "Master Admin access with MFA is required" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Invalid fund-release review id" }); return; }
  const note = typeof req.body?.reviewNote === "string"
    ? req.body.reviewNote.trim().slice(0, 500)
    : "Provider re-verified and released by Master Admin";
  const initialResult = await db.execute(sql`
    SELECT id,merchant_id,source_type,source_reference,payment_intent_id,order_id,invoice_id,payment_record_id,
           provider,provider_transaction_id,provider_reference,provider_amount_minor,provider_currency,
           provider_fee_evidence_minor,amount_minor,currency,invoice_id,legacy_hold,held_amount_minor,
           legacy_provider_fee_posted_minor,legacy_lunavo_fee_posted_minor,
           provider_fee_minor,lunavo_fee_minor,merchant_net_minor,status
    FROM merchant_fund_release_reviews WHERE id=${id} LIMIT 1
  `);
  const initial = initialResult.rows[0] as Record<string, any> | undefined;
  if (!initial) { res.status(404).json({ error: "Fund-release review not found" }); return; }
  if (String(initial.status) === "released") {
    res.json({ id, status: "released", replayed: true, message: "Proceeds were already released." });
    return;
  }
  if (String(initial.status) !== "pending") {
    res.status(409).json({ error: "This proceeds row requires reconciliation and cannot be released." });
    return;
  }
  if (String(initial.provider) !== "flutterwave" || !String(initial.provider_transaction_id ?? "")) {
    res.status(409).json({ error: "The release row has no valid supported provider transaction." });
    return;
  }

  let verified: Record<string, any>;
  try {
    verified = await verifyFlutterwaveTransaction(String(initial.provider_transaction_id)) as unknown as Record<string, any>;
  } catch (error) {
    req.log.warn({ err: error, fundReleaseId: id }, "Flutterwave re-verification failed before merchant fund release");
    res.status(502).json({ error: "Flutterwave could not re-verify this payment. Proceeds remain locked." });
    return;
  }

  const observedId = flutterwaveTransactionId(verified as any);
  const observedAmountMinor = toMinorUnits(flutterwaveAmount(verified as any));
  const observedCurrency = String(verified.currency ?? "").trim().toUpperCase();
  const observedReference = String(verified.tx_ref ?? verified.reference ?? "").trim();
  const refundStatus = String(verified.refund_status ?? "").trim().toLowerCase();
  const disputeStatus = String(verified.dispute_status ?? "").trim().toLowerCase();
  const observedProviderFee = verified.app_fee == null || verified.app_fee === "" ? null : toMinorUnits(Number(verified.app_fee), currencyMinorDigits(observedCurrency));
  const amountMinor = Number(initial.amount_minor);
  const providerAmountMinor = Number(initial.provider_amount_minor);
  const providerCurrency = String(initial.provider_currency).toUpperCase();
  const providerFeeEvidenceMinor = initial.provider_fee_evidence_minor == null ? null : Number(initial.provider_fee_evidence_minor);
  const providerFeeMinor = Number(initial.provider_fee_minor);
  const lunavoFeeMinor = Number(initial.lunavo_fee_minor);
  const merchantNetMinor = Number(initial.merchant_net_minor);
  const reversalOrDispute = ["successful","processed","refunded","completed"].includes(refundStatus) ||
    ["chargeback","charged_back","reversed","open","active","disputed"].includes(disputeStatus);
  const releaseFailure = merchantFundReleaseVerificationFailure({
    providerPaid: flutterwaveStatus(verified as any) === "paid",
    reversalOrDispute,
    observedTransactionId: observedId || null,
    expectedTransactionId: String(initial.provider_transaction_id),
    observedAmountMinor,
    expectedAmountMinor: providerAmountMinor,
    observedCurrency,
    expectedCurrency: providerCurrency,
    observedReference,
    expectedReference: initial.provider_reference == null ? null : String(initial.provider_reference),
    observedProviderFeeMinor: observedProviderFee,
    expectedProviderFeeMinor: providerFeeMinor,
    expectedProviderFeeEvidenceMinor: providerFeeEvidenceMinor,
    expectedMerchantGrossMinor: amountMinor,
    expectedMerchantCurrency: String(initial.currency).toUpperCase(),
    expectedLunavoFeeMinor: lunavoFeeMinor,
    expectedMerchantNetMinor: merchantNetMinor,
  });

  if (releaseFailure) {
    await db.transaction(async (tx) => {
      const flagged = await tx.execute(sql`
        UPDATE merchant_fund_release_reviews
        SET status='reconciliation_required', reviewed_at=now(), reviewed_by=${userId},
            review_note=${releaseFailure.slice(0,500)}
        WHERE id=${id} AND status='pending' RETURNING merchant_id,source_reference
      `);
      if (!flagged.rows.length) return;
      const row = flagged.rows[0] as { merchant_id:number|string; source_reference:string };
      await tx.execute(sql`
        INSERT INTO audit_logs (
          user_id,merchant_id,action,resource_type,resource_id,changes,
          ip_address,user_agent,status,created_at
        ) VALUES (
          ${userId},${String(row.merchant_id)},'merchant_funds_release_blocked','merchant_fund_release_review',
          ${String(id)},${JSON.stringify({reason:releaseFailure,sourceReference:String(row.source_reference)})}::jsonb,
          ${req.ip ?? null},${req.get("user-agent")?.slice(0,500) ?? null},'success',now()
        )
      `);
    });
    res.status(409).json({ error: releaseFailure + " Proceeds remain locked and the row was sent to reconciliation." });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      // Match reverseOrderPayment/processOrderPayment lock order (intent first,
      // release review second) so a concurrent refund cannot deadlock the release.
      if (String(initial.source_type) === "order_payment" && initial.payment_intent_id != null) {
        await tx.execute(sql`SELECT id FROM payment_intents WHERE id=${Number(initial.payment_intent_id)} FOR UPDATE`);
      }
      const lockedResult = await tx.execute(sql`
        SELECT id,merchant_id,source_type,source_reference,payment_intent_id,order_id,invoice_id,payment_record_id,
               provider,provider_transaction_id,provider_reference,provider_amount_minor,provider_currency,
               provider_fee_evidence_minor,amount_minor,currency,legacy_hold,held_amount_minor,
               legacy_provider_fee_posted_minor,legacy_lunavo_fee_posted_minor,
               provider_fee_minor,lunavo_fee_minor,merchant_net_minor,status
        FROM merchant_fund_release_reviews WHERE id=${id} FOR UPDATE
      `);
      const row = lockedResult.rows[0] as Record<string, any> | undefined;
      if (!row) return { outcome: "missing" as const };
      if (String(row.status) === "released") return { outcome: "duplicate" as const };
      if (String(row.status) !== "pending") return { outcome: "blocked" as const, reason: "Fund-release row is no longer pending." };
      const blockRelease = async (reason: string) => {
        await tx.execute(sql`
          UPDATE merchant_fund_release_reviews
          SET status='reconciliation_required',reviewed_at=now(),reviewed_by=${userId},review_note=${reason.slice(0,500)}
          WHERE id=${id} AND status='pending'
        `);
        await tx.execute(sql`
          INSERT INTO audit_logs (
            user_id,merchant_id,action,resource_type,resource_id,changes,
            ip_address,user_agent,status,created_at
          ) VALUES (
            ${userId},${String(row.merchant_id)},'merchant_funds_release_blocked','merchant_fund_release_review',
            ${String(id)},${JSON.stringify({reason,sourceReference:String(row.source_reference)})}::jsonb,
            ${req.ip ?? null},${req.get("user-agent")?.slice(0,500) ?? null},'success',now()
          )
        `);
        return { outcome: "blocked" as const, reason };
      };

      if (String(row.source_type) === "order_payment") {
        const intentResult = await tx.execute(sql`
          SELECT id,status,provider_transaction_id,order_id,merchant_id
          FROM payment_intents WHERE id=${Number(row.payment_intent_id)} FOR UPDATE
        `);
        const intent = intentResult.rows[0] as Record<string, any> | undefined;
        if (!intent || String(intent.status) !== "successful" ||
            String(intent.provider_transaction_id ?? "") !== String(row.provider_transaction_id) ||
            Number(intent.order_id) !== Number(row.order_id) ||
            Number(intent.merchant_id) !== Number(row.merchant_id)) {
          return await blockRelease("The underlying payment intent is not in a matching successful state.");
        }
        const exceptionResult = await tx.execute(sql`
          SELECT id FROM payment_reconciliation_exceptions
          WHERE payment_intent_id=${Number(row.payment_intent_id)}
            AND resolved_at IS NULL AND status NOT IN ('resolved','closed','dismissed')
          LIMIT 1
        `);
        if (exceptionResult.rows.length) return await blockRelease("An unresolved payment reconciliation exception prevents release.");
        const recordResult = await tx.execute(sql`
          SELECT id,status FROM payment_records
          WHERE id=${Number(row.payment_record_id)} AND intent_id=${Number(row.payment_intent_id)}
          LIMIT 1 FOR UPDATE
        `);
        const record = recordResult.rows[0] as Record<string, any> | undefined;
        if (!record || String(record.status) !== "successful") {
          return await blockRelease("The verified payment record is missing or no longer successful.");
        }
        const orderResult = await tx.execute(sql`
          SELECT id,status FROM orders
          WHERE id=${Number(row.order_id)} AND merchant_id=${Number(row.merchant_id)}
          LIMIT 1 FOR UPDATE
        `);
        const order = orderResult.rows[0] as Record<string, any> | undefined;
        if (!order || String(order.status) !== "paid") {
          return await blockRelease("The associated order is not in paid status.");
        }
      } else if (String(row.source_type) === "invoice_payment") {
        const invoiceResult = await tx.execute(sql`
          SELECT id,status,merchant_id FROM invoices WHERE id=${Number(row.invoice_id)}
            AND merchant_id=${Number(row.merchant_id)} LIMIT 1 FOR UPDATE
        `);
        const invoice = invoiceResult.rows[0] as Record<string, any> | undefined;
        if (!invoice || !["paid","partially_paid"].includes(String(invoice.status))) return await blockRelease("The invoice is not paid or partially paid.");
        const intentResult = await tx.execute(sql`
          SELECT id,status,provider_transaction_id,merchant_id FROM payment_intents
          WHERE id=${Number(row.payment_intent_id)} AND merchant_id=${Number(row.merchant_id)} LIMIT 1
        `);
        const intent = intentResult.rows[0] as Record<string, any> | undefined;
        if (!intent || !["successful","verified"].includes(String(intent.status)) ||
            String(intent.provider_transaction_id ?? "") !== String(row.provider_transaction_id)) return await blockRelease("The online invoice payment intent does not match provider evidence.");
        const recordResult = await tx.execute(sql`
          SELECT id,status FROM payment_records WHERE id=${Number(row.payment_record_id)}
            AND intent_id=${Number(row.payment_intent_id)} AND merchant_id=${Number(row.merchant_id)} LIMIT 1
        `);
        const record = recordResult.rows[0] as Record<string, any> | undefined;
        if (!record || !["successful","verified"].includes(String(record.status))) return await blockRelease("The invoice payment record is missing or unverified.");
        const exceptionResult = await tx.execute(sql`
          SELECT id FROM payment_reconciliation_exceptions WHERE payment_intent_id=${Number(row.payment_intent_id)}
            AND resolved_at IS NULL AND status NOT IN ('resolved','closed','dismissed') LIMIT 1
        `);
        if (exceptionResult.rows.length) return await blockRelease("An unresolved invoice payment exception prevents release.");
      } else if (String(row.source_type) === "store_auction") {
        const auctionEvidence = await tx.execute(sql`
          SELECT id FROM store_auction_payment_verifications
          WHERE provider='flutterwave' AND provider_reference=${String(row.provider_transaction_id)}
            AND status='verified' LIMIT 1 FOR UPDATE
        `);
        if (!auctionEvidence.rows.length) return await blockRelease("Verified store-auction settlement evidence is missing.");
      } else if (String(row.source_type) === "product_auction") {
        const auctionEvidence = await tx.execute(sql`
          SELECT id FROM product_auction_settlements
          WHERE provider_transaction_id=${String(row.provider_transaction_id)}
            AND status='paid' LIMIT 1 FOR UPDATE
        `);
        if (!auctionEvidence.rows.length) return await blockRelease("Verified product-auction settlement evidence is missing.");
      } else {
        return await blockRelease("Unsupported fund-release source type.");
      }

      // Finalize this immutable review before creating any positive sale/fund-release
      // ledger row. PostgreSQL's ledger trigger requires that status in the same tx.
      const finalized = await tx.execute(sql`
        UPDATE merchant_fund_release_reviews
        SET status='released',reviewed_at=now(),reviewed_by=${userId},review_note=${note}
        WHERE id=${id} AND status='pending' RETURNING id
      `);
      if (!finalized.rows.length) return { outcome: "duplicate" as const };

      if (Boolean(row.legacy_hold)) {
        const heldAmountMinor = Number(row.held_amount_minor ?? 0);
        const missingProviderFeeMinor = providerFeeMinor - Number(row.legacy_provider_fee_posted_minor ?? 0);
        const missingLunavoFeeMinor = lunavoFeeMinor - Number(row.legacy_lunavo_fee_posted_minor ?? 0);
        if (!Number.isSafeInteger(heldAmountMinor) || heldAmountMinor < merchantNetMinor ||
            missingProviderFeeMinor < 0 || missingLunavoFeeMinor < 0) {
          return await blockRelease("Legacy hold and fee entries do not reconcile; Finance must resolve the discrepancy.");
        }
        if (heldAmountMinor > 0) {
          await tx.execute(sql`
            INSERT INTO ledger_entries (merchant_id,order_id,invoice_id,payment_record_id,amount_minor,currency,entry_type,reference_key)
            VALUES (${Number(row.merchant_id)},${row.order_id == null ? null : Number(row.order_id)},
                    ${row.invoice_id == null ? null : Number(row.invoice_id)},${row.payment_record_id == null ? null : Number(row.payment_record_id)},
                    ${heldAmountMinor},${String(row.currency).toUpperCase()},'merchant_funds_release',
                    ${"merchant-fund-release:legacy-release:" + String(row.source_reference)})
            ON CONFLICT (reference_key) DO NOTHING
          `);
        }
        if (missingProviderFeeMinor > 0) {
          await tx.execute(sql`
            INSERT INTO ledger_entries (merchant_id,order_id,invoice_id,payment_record_id,amount_minor,currency,entry_type,reference_key)
            VALUES (${Number(row.merchant_id)},${row.order_id == null ? null : Number(row.order_id)},
                    ${row.invoice_id == null ? null : Number(row.invoice_id)},${row.payment_record_id == null ? null : Number(row.payment_record_id)},
                    ${-missingProviderFeeMinor},${String(row.currency).toUpperCase()},'fee',
                    ${"merchant-fund-release:legacy-provider-fee:" + String(row.source_reference)})
            ON CONFLICT (reference_key) DO NOTHING
          `);
        }
        if (missingLunavoFeeMinor > 0) {
          await tx.execute(sql`
            INSERT INTO ledger_entries (merchant_id,order_id,invoice_id,payment_record_id,amount_minor,currency,entry_type,reference_key)
            VALUES (${Number(row.merchant_id)},${row.order_id == null ? null : Number(row.order_id)},
                    ${row.invoice_id == null ? null : Number(row.invoice_id)},${row.payment_record_id == null ? null : Number(row.payment_record_id)},
                    ${-missingLunavoFeeMinor},${String(row.currency).toUpperCase()},'fee',
                    ${"merchant-fund-release:legacy-lunavo-fee:" + String(row.source_reference)})
            ON CONFLICT (reference_key) DO NOTHING
          `);
        }
      } else {
        const saleReference = String(row.source_reference) + ":released-sale";
        await tx.execute(sql`
          INSERT INTO ledger_entries (merchant_id,order_id,invoice_id,payment_record_id,amount_minor,currency,entry_type,reference_key)
          VALUES (${Number(row.merchant_id)},${row.order_id == null ? null : Number(row.order_id)},
                  ${row.invoice_id == null ? null : Number(row.invoice_id)},${row.payment_record_id == null ? null : Number(row.payment_record_id)},
                  ${amountMinor},${String(row.currency).toUpperCase()},'sale',${saleReference})
          ON CONFLICT (reference_key) DO NOTHING
        `);
        if (providerFeeMinor > 0) {
          await tx.execute(sql`
            INSERT INTO ledger_entries (merchant_id,order_id,invoice_id,payment_record_id,amount_minor,currency,entry_type,reference_key)
            VALUES (${Number(row.merchant_id)},${row.order_id == null ? null : Number(row.order_id)},
                    ${row.invoice_id == null ? null : Number(row.invoice_id)},${row.payment_record_id == null ? null : Number(row.payment_record_id)},
                    ${-providerFeeMinor},${String(row.currency).toUpperCase()},'fee',${String(row.source_reference)+":released-provider-fee"})
            ON CONFLICT (reference_key) DO NOTHING
          `);
        }
        if (lunavoFeeMinor > 0) {
          await tx.execute(sql`
            INSERT INTO ledger_entries (merchant_id,order_id,invoice_id,payment_record_id,amount_minor,currency,entry_type,reference_key)
            VALUES (${Number(row.merchant_id)},${row.order_id == null ? null : Number(row.order_id)},
                    ${row.invoice_id == null ? null : Number(row.invoice_id)},${row.payment_record_id == null ? null : Number(row.payment_record_id)},
                    ${-lunavoFeeMinor},${String(row.currency).toUpperCase()},'fee',${String(row.source_reference)+":released-lunavo-fee"})
            ON CONFLICT (reference_key) DO NOTHING
          `);
        }
      }
      await tx.execute(sql`
        UPDATE lunavo_dashboard_transactions
        SET metadata=COALESCE(metadata,'{}'::jsonb) || ${JSON.stringify({fundsReleased:true,releaseReviewStatus:"released"})}::jsonb,
            updated_at=now()
        WHERE merchant_id=${Number(row.merchant_id)} AND idempotency_key=${String(row.source_reference)}
      `);
      await tx.execute(sql`
        INSERT INTO audit_logs (
          user_id,merchant_id,action,resource_type,resource_id,changes,
          ip_address,user_agent,status,created_at
        ) VALUES (
          ${userId},${String(row.merchant_id)},'merchant_funds_released','merchant_fund_release_review',
          ${String(id)},${JSON.stringify({
            sourceType: String(row.source_type), sourceReference: String(row.source_reference),
            amountMinor, currency: String(row.currency).toUpperCase(), provider: "flutterwave",
            providerTransactionId: String(row.provider_transaction_id), providerReference: row.provider_reference,
            providerFeeMinor, lunavoFeeMinor, merchantNetMinor
          })}::jsonb,${req.ip ?? null},${req.get("user-agent")?.slice(0,500) ?? null},'success',now()
        )
      `);
      return { outcome: "released" as const };
    });
    if (result.outcome === "missing") { res.status(404).json({ error: "Fund-release review not found" }); return; }
    if (result.outcome === "blocked") { res.status(409).json({ error: result.reason + " Proceeds remain locked." }); return; }
    if (result.outcome === "duplicate") { res.json({ id, status: "released", replayed: true }); return; }
    res.json({ id, status: "released", replayed: false, message: "Provider payment was re-verified; seller proceeds and fee lines were posted to TS Pay ledger." });
  } catch (error) {
    req.log.error({ err: error, fundReleaseId: id }, "Failed to release verified merchant proceeds");
    res.status(500).json({ error: "Proceeds were not released because the ledger transaction failed. Check the release row before retrying." });
  }
});

export default router;
