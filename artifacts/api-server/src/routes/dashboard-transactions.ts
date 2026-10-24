import { Router, type Request, type Response } from "express";
import { getAuth } from "../lib/auth-compat";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireMasterAdmin } from "../lib/master-admin";
import { flutterwaveAmount, flutterwaveStatus, flutterwaveTransactionId, verifyFlutterwaveTransaction } from "../lib/flutterwave-client";
import { merchantFundReleaseVerificationFailure } from "../lib/merchant-fund-release-policy";
import { toMinorUnits } from "../lib/money";

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
             r.provider,r.provider_transaction_id,r.provider_reference,r.amount_minor,r.currency,r.legacy_hold,
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
    SELECT id,merchant_id,source_type,source_reference,payment_intent_id,order_id,payment_record_id,
           provider,provider_transaction_id,provider_reference,amount_minor,currency,legacy_hold,
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
  const observedProviderFee = verified.app_fee == null || verified.app_fee === "" ? null : toMinorUnits(verified.app_fee);
  const amountMinor = Number(initial.amount_minor);
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
    expectedAmountMinor: amountMinor,
    observedCurrency,
    expectedCurrency: String(initial.currency).toUpperCase(),
    observedReference,
    expectedReference: initial.provider_reference == null ? null : String(initial.provider_reference),
    observedProviderFeeMinor: observedProviderFee,
    expectedProviderFeeMinor: providerFeeMinor,
    expectedLunavoFeeMinor: lunavoFeeMinor,
    expectedMerchantNetMinor: merchantNetMinor,
  });

  if (releaseFailure) {
    await db.execute(sql`
      UPDATE merchant_fund_release_reviews
      SET status='reconciliation_required', reviewed_at=now(), reviewed_by=${userId},
          review_note=${releaseFailure.slice(0,500)}
      WHERE id=${id} AND status='pending'
    `);
    await db.execute(sql`
      INSERT INTO audit_logs (
        user_id,merchant_id,action,resource_type,resource_id,changes,
        ip_address,user_agent,status,created_at
      ) VALUES (
        ${userId},${String(initial.merchant_id)},'merchant_funds_release_blocked','merchant_fund_release_review',
        ${String(id)},${JSON.stringify({reason: releaseFailure, sourceReference: String(initial.source_reference)})}::jsonb,
        ${req.ip ?? null},${req.get("user-agent")?.slice(0,500) ?? null},'blocked',now()
      )
    `);
    res.status(409).json({ error: releaseFailure + " Proceeds remain locked and the row was sent to reconciliation." });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const lockedResult = await tx.execute(sql`
        SELECT id,merchant_id,source_type,source_reference,payment_intent_id,order_id,payment_record_id,
               provider,provider_transaction_id,provider_reference,amount_minor,currency,legacy_hold,
               provider_fee_minor,lunavo_fee_minor,merchant_net_minor,status
        FROM merchant_fund_release_reviews WHERE id=${id} FOR UPDATE
      `);
      const row = lockedResult.rows[0] as Record<string, any> | undefined;
      if (!row) return { outcome: "missing" as const };
      if (String(row.status) === "released") return { outcome: "duplicate" as const };
      if (String(row.status) !== "pending") return { outcome: "blocked" as const, reason: "Fund-release row is no longer pending." };

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
          return { outcome: "blocked" as const, reason: "The underlying payment intent is not in a matching successful state." };
        }
        const exceptionResult = await tx.execute(sql`
          SELECT id FROM payment_reconciliation_exceptions
          WHERE payment_intent_id=${Number(row.payment_intent_id)}
            AND resolved_at IS NULL AND status NOT IN ('resolved','closed','dismissed')
          LIMIT 1
        `);
        if (exceptionResult.rows.length) return { outcome: "blocked" as const, reason: "An unresolved payment reconciliation exception prevents release." };
        const recordResult = await tx.execute(sql`
          SELECT id,status FROM payment_records
          WHERE id=${Number(row.payment_record_id)} AND intent_id=${Number(row.payment_intent_id)}
          LIMIT 1 FOR UPDATE
        `);
        const record = recordResult.rows[0] as Record<string, any> | undefined;
        if (!record || String(record.status) !== "successful") {
          return { outcome: "blocked" as const, reason: "The verified payment record is missing or no longer successful." };
        }
        const orderResult = await tx.execute(sql`
          SELECT id,status FROM orders
          WHERE id=${Number(row.order_id)} AND merchant_id=${Number(row.merchant_id)}
          LIMIT 1 FOR UPDATE
        `);
        const order = orderResult.rows[0] as Record<string, any> | undefined;
        if (!order || String(order.status) !== "paid") {
          return { outcome: "blocked" as const, reason: "The associated order is not in paid status." };
        }
      } else if (String(row.source_type) === "store_auction") {
        const auctionEvidence = await tx.execute(sql`
          SELECT id FROM store_auction_payment_verifications
          WHERE provider='flutterwave' AND provider_reference=${String(row.provider_transaction_id)}
            AND status='verified' LIMIT 1 FOR UPDATE
        `);
        if (!auctionEvidence.rows.length) return { outcome: "blocked" as const, reason: "Verified store-auction settlement evidence is missing." };
      } else if (String(row.source_type) === "product_auction") {
        const auctionEvidence = await tx.execute(sql`
          SELECT id FROM product_auction_settlements
          WHERE provider_transaction_id=${String(row.provider_transaction_id)}
            AND status='paid' LIMIT 1 FOR UPDATE
        `);
        if (!auctionEvidence.rows.length) return { outcome: "blocked" as const, reason: "Verified product-auction settlement evidence is missing." };
      } else {
        return { outcome: "blocked" as const, reason: "Unsupported fund-release source type." };
      }

      if (Boolean(row.legacy_hold)) {
        // Migration 0130 already has the immutable sale/fee history. Reverse the
        // matching hold only; posting a second sale would double-credit proceeds.
        if (merchantNetMinor > 0) {
          await tx.execute(sql`
            INSERT INTO ledger_entries (merchant_id,order_id,payment_record_id,amount_minor,currency,entry_type,reference_key)
            VALUES (${Number(row.merchant_id)},${row.order_id == null ? null : Number(row.order_id)},
                    ${row.payment_record_id == null ? null : Number(row.payment_record_id)},
                    ${merchantNetMinor},${String(row.currency).toUpperCase()},'merchant_funds_release',
                    ${"merchant-fund-release:legacy-release:" + String(row.source_reference)})
            ON CONFLICT (reference_key) DO NOTHING
          `);
        }
      } else {
        const saleReference = String(row.source_reference) + ":released-sale";
        await tx.execute(sql`
          INSERT INTO ledger_entries (merchant_id,order_id,payment_record_id,amount_minor,currency,entry_type,reference_key)
          VALUES (${Number(row.merchant_id)},${row.order_id == null ? null : Number(row.order_id)},
                  ${row.payment_record_id == null ? null : Number(row.payment_record_id)},
                  ${amountMinor},${String(row.currency).toUpperCase()},'sale',${saleReference})
          ON CONFLICT (reference_key) DO NOTHING
        `);
        if (providerFeeMinor > 0) {
          await tx.execute(sql`
            INSERT INTO ledger_entries (merchant_id,order_id,payment_record_id,amount_minor,currency,entry_type,reference_key)
            VALUES (${Number(row.merchant_id)},${row.order_id == null ? null : Number(row.order_id)},
                    ${row.payment_record_id == null ? null : Number(row.payment_record_id)},
                    ${-providerFeeMinor},${String(row.currency).toUpperCase()},'fee',${String(row.source_reference)+":released-provider-fee"})
            ON CONFLICT (reference_key) DO NOTHING
          `);
        }
        if (lunavoFeeMinor > 0) {
          await tx.execute(sql`
            INSERT INTO ledger_entries (merchant_id,order_id,payment_record_id,amount_minor,currency,entry_type,reference_key)
            VALUES (${Number(row.merchant_id)},${row.order_id == null ? null : Number(row.order_id)},
                    ${row.payment_record_id == null ? null : Number(row.payment_record_id)},
                    ${-lunavoFeeMinor},${String(row.currency).toUpperCase()},'fee',${String(row.source_reference)+":released-lunavo-fee"})
            ON CONFLICT (reference_key) DO NOTHING
          `);
        }
      }
      const updated = await tx.execute(sql`
        UPDATE merchant_fund_release_reviews
        SET status='released',reviewed_at=now(),reviewed_by=${userId},review_note=${note}
        WHERE id=${id} AND status='pending' RETURNING id
      `);
      if (!updated.rows.length) return { outcome: "duplicate" as const };
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
