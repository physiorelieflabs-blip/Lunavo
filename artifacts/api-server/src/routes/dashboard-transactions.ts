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
      WHERE p.status NOT IN ('verified','failed','cancelled','expired','refunded','reversed')
        AND (${currency ? sql`p.currency=${currency}` : sql`true`})
        AND (${merchantId ? sql`p.merchant_id=${merchantId}` : sql`true`})
      ORDER BY p.created_at ASC
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
    const pendingSaleReleases = await db.execute(sql`
      SELECT r.id,r.merchant_id,m.name AS merchant_name,m.email AS merchant_email,
             r.order_id,r.invoice_id,r.payment_record_id,r.payment_intent_id,
             r.source_type,r.source_reference,r.release_amount_minor,r.currency,
             r.provider_reference,r.provider_transaction_id,r.status,r.created_at
      FROM merchant_sale_release_requests r
      INNER JOIN merchants m ON m.id=r.merchant_id
      WHERE r.status='pending_review'
        AND (${currency ? sql`r.currency=${currency}` : sql`true`})
        AND (${merchantId ? sql`r.merchant_id=${merchantId}` : sql`true`})
      ORDER BY r.created_at ASC
      LIMIT ${limit}
    `);
    res.json({
      transactions: rows.rows,
      summary: summary.rows,
      pendingWithdrawals: pendingWithdrawals.rows,
      pendingPaymentIntents: pendingPaymentIntents.rows,
      pendingSaleReleases: pendingSaleReleases.rows,
      openReconciliationExceptions: openReconciliationExceptions.rows,
      sourceOfTruth: "immutable TS Pay ledger + provider-verified dashboard projection",
      moneyMovement: "ledger_release_only",
      message: "All new sale ledger credits are offset by an immutable ledger hold until a Master Admin reviews and releases the request. Dashboard rows alone never confirm external funds movement.",
    });
  } catch (error) { next(error); }
});



router.post("/admin/dashboard/sale-releases/:id/approve", async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    await requireMasterAdmin(userId);
  } catch {
    res.status(403).json({ error: "Master Admin access with MFA is required" });
    return;
  }

  const releaseId = Number(req.params.id);
  const reviewNote = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  if (!Number.isSafeInteger(releaseId) || releaseId < 1) {
    res.status(400).json({ error: "Sale release ID must be a positive integer" });
    return;
  }
  if (reviewNote.length < 10 || reviewNote.length > 500) {
    res.status(400).json({ error: "A Finance review note of 10–500 characters is required" });
    return;
  }

  try {
    const outcome = await db.transaction(async tx => {
      // Read without a lock first so we can follow the same payment-intent ->
      // release-request lock order used by reversal/webhook processing.
      const peekResult = await tx.execute(sql`SELECT * FROM merchant_sale_release_requests WHERE id=${releaseId}`);
      const peek = peekResult.rows[0] as Record<string, any> | undefined;
      if (!peek) return { kind: "not_found" as const };
      if (String(peek.status) === "released") return { kind: "already_released" as const, duplicate: true };
      if (String(peek.status) !== "pending_review") return { kind: "conflict" as const, status: String(peek.status) };

      const merchantId = Number(peek.merchant_id);
      const intentId = Number(peek.payment_intent_id ?? 0);
      let providerReference = String(peek.provider_reference ?? "").trim();
      let providerTransactionId = String(peek.provider_transaction_id ?? "").trim();
      let merchantStatus = "";

      if (intentId > 0) {
        const intentResult = await tx.execute(sql`
          SELECT pi.id,pi.merchant_id,pi.currency,pi.status,pi.provider_transaction_id,
                 pi.evidence_reference,pr.status AS payment_record_status,
                 pr.evidence_reference AS payment_record_evidence,m.status AS merchant_status
          FROM payment_intents pi
          INNER JOIN merchants m ON m.id=pi.merchant_id
          LEFT JOIN payment_records pr ON pr.id=${Number(peek.payment_record_id ?? 0)} AND pr.intent_id=pi.id
          WHERE pi.id=${intentId}
          FOR UPDATE OF pi,m
        `);
        const intent = intentResult.rows[0] as Record<string, any> | undefined;
        if (!intent || Number(intent.merchant_id) !== merchantId ||
            String(intent.currency).toUpperCase() !== String(peek.currency).toUpperCase()) {
          return { kind: "conflict" as const, status: "payment_identity_mismatch" };
        }
        if (!["successful","verified"].includes(String(intent.status)) ||
            (intent.payment_record_status && !["successful","verified"].includes(String(intent.payment_record_status)))) {
          return { kind: "conflict" as const, status: "payment_not_verified" };
        }
        merchantStatus = String(intent.merchant_status);
        providerTransactionId ||= String(intent.provider_transaction_id ?? "").trim();
        providerReference ||= String(intent.payment_record_evidence ?? intent.evidence_reference ?? "").trim();
        if (!providerTransactionId && !providerReference) {
          return { kind: "conflict" as const, status: "provider_evidence_missing" };
        }
      } else if (String(peek.source_type) === "store_auction_sale") {
        const match = /^store-auction-sale:(\d+):(\d+)$/.exec(String(peek.source_reference));
        if (!match || !providerReference || !providerTransactionId) {
          return { kind: "conflict" as const, status: "auction_provider_evidence_missing" };
        }
        const auctionResult = await tx.execute(sql`
          SELECT payment_status,payment_reference,currency,seller_merchant_id
          FROM store_auction_listings WHERE id=${Number(match[1])} FOR UPDATE
        `);
        const auction = auctionResult.rows[0] as Record<string, any> | undefined;
        if (!auction || Number(auction.seller_merchant_id) !== merchantId ||
            String(auction.payment_status).toLowerCase() !== "verified" ||
            String(auction.payment_reference ?? "") !== providerReference ||
            String(auction.currency).toUpperCase() !== String(peek.currency).toUpperCase()) {
          return { kind: "conflict" as const, status: "store_auction_not_verified" };
        }
      } else if (String(peek.source_type) === "product_auction_sale") {
        const match = /^product-auction:(\d+):(\d+):sale$/.exec(String(peek.source_reference));
        if (!match || !providerReference || !providerTransactionId) {
          return { kind: "conflict" as const, status: "auction_provider_evidence_missing" };
        }
        const auctionResult = await tx.execute(sql`
          SELECT status,settlement_status,settlement_reference,currency,merchant_id
          FROM auction_listings WHERE id=${Number(match[1])} FOR UPDATE
        `);
        const auction = auctionResult.rows[0] as Record<string, any> | undefined;
        if (!auction || Number(auction.merchant_id) !== merchantId ||
            String(auction.status).toLowerCase() !== "paid" ||
            String(auction.settlement_status).toLowerCase() !== "verified" ||
            String(auction.settlement_reference ?? "") !== providerTransactionId ||
            String(auction.currency).toUpperCase() !== String(peek.currency).toUpperCase()) {
          return { kind: "conflict" as const, status: "product_auction_not_verified" };
        }
      } else if (String(peek.source_type) !== "legacy_balance") {
        return { kind: "conflict" as const, status: "payment_evidence_missing" };
      }

      const exceptionResult = String(peek.source_type) === "legacy_balance"
        ? await tx.execute(sql`
            SELECT id FROM payment_reconciliation_exceptions
            WHERE merchant_id=${merchantId} AND resolved_at IS NULL
              AND status NOT IN ('resolved','closed','dismissed')
            LIMIT 1
          `)
        : await tx.execute(sql`
            SELECT id FROM payment_reconciliation_exceptions
            WHERE merchant_id=${merchantId} AND resolved_at IS NULL
              AND status NOT IN ('resolved','closed','dismissed')
              AND (
                (${intentId} > 0 AND payment_intent_id=${intentId})
                OR (${providerTransactionId} <> '' AND provider_transaction_id=${providerTransactionId})
                OR (${providerReference} <> '' AND payment_reference=${providerReference})
              )
            LIMIT 1
          `);
      if (exceptionResult.rows.length) return { kind: "conflict" as const, status: "open_reconciliation_exception" };

      const lockedResult = await tx.execute(sql`SELECT * FROM merchant_sale_release_requests WHERE id=${releaseId} FOR UPDATE`);
      const release = lockedResult.rows[0] as Record<string, any> | undefined;
      if (!release) return { kind: "not_found" as const };
      if (String(release.status) === "released") return { kind: "already_released" as const, duplicate: true };
      if (String(release.status) !== "pending_review") return { kind: "conflict" as const, status: String(release.status) };

      const merchantResult = await tx.execute(sql`SELECT id,status FROM merchants WHERE id=${merchantId} FOR UPDATE`);
      const merchant = merchantResult.rows[0] as Record<string, any> | undefined;
      merchantStatus = merchantStatus || String(merchant?.status ?? "");
      if (!merchant || merchantStatus !== "active" || String(merchant.status) !== "active") {
        return { kind: "conflict" as const, status: "merchant_not_active" };
      }

      const amountMinor = Number(release.release_amount_minor);
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        return { kind: "conflict" as const, status: "invalid_release_amount" };
      }
      const holdResult = await tx.execute(sql`
        SELECT id,merchant_id,amount_minor,currency FROM ledger_entries
        WHERE reference_key=${"sale-release-hold:" + String(release.source_reference)}
        FOR UPDATE
      `);
      const hold = holdResult.rows[0] as Record<string, any> | undefined;
      if (!hold || Number(hold.merchant_id) !== merchantId ||
          Number(hold.amount_minor) !== -amountMinor ||
          String(hold.currency).toUpperCase() !== String(release.currency).toUpperCase()) {
        return { kind: "conflict" as const, status: "sale_hold_missing_or_mismatch" };
      }
      if (String(release.source_type) !== "legacy_balance") {
        const saleResult = await tx.execute(sql`
          SELECT id,merchant_id,amount_minor,currency,order_id,invoice_id,payment_record_id
          FROM ledger_entries
          WHERE entry_type='sale' AND reference_key=${String(release.source_reference)}
          FOR UPDATE
        `);
        const sale = saleResult.rows[0] as Record<string, any> | undefined;
        if (!sale || Number(sale.merchant_id) !== merchantId ||
            Number(sale.amount_minor) !== amountMinor ||
            String(sale.currency).toUpperCase() !== String(release.currency).toUpperCase() ||
            Number(sale.order_id ?? 0) !== Number(release.order_id ?? 0) ||
            Number(sale.invoice_id ?? 0) !== Number(release.invoice_id ?? 0) ||
            Number(sale.payment_record_id ?? 0) !== Number(release.payment_record_id ?? 0)) {
          return { kind: "conflict" as const, status: "sale_ledger_mismatch" };
        }
      }
      const priorMarker = await tx.execute(sql`
        SELECT id FROM ledger_entries
        WHERE reference_key IN (${"sale-release:" + releaseId},${"sale-release-cancel:" + releaseId})
        LIMIT 1
      `);
      if (priorMarker.rows.length) {
        return { kind: "conflict" as const, status: "release_marker_exists" };
      }
      await tx.execute(sql`
        INSERT INTO ledger_entries (
          merchant_id,order_id,invoice_id,payment_record_id,amount_minor,currency,entry_type,reference_key
        ) VALUES (
          ${merchantId},${release.order_id ?? null},${release.invoice_id ?? null},
          ${release.payment_record_id ?? null},${amountMinor},upper(${String(release.currency)}),
          'sale_release',${"sale-release:" + releaseId}
        ) ON CONFLICT (reference_key) DO NOTHING
      `);
      await tx.execute(sql`
        UPDATE merchant_sale_release_requests
        SET status='released',reviewed_by=${userId},reviewed_at=now(),review_note=${reviewNote},
            provider_reference=COALESCE(provider_reference,${providerReference || null}),
            provider_transaction_id=COALESCE(provider_transaction_id,${providerTransactionId || null}),
            updated_at=now()
        WHERE id=${releaseId} AND status='pending_review'
      `);
      return { kind: "released" as const, duplicate: false, id: releaseId, amountMinor, currency: String(release.currency).toUpperCase() };
    });

    if (outcome.kind === "not_found") { res.status(404).json({ error: "Sale release request not found" }); return; }
    if (outcome.kind === "conflict") {
      res.status(409).json({ error: "Sale proceeds were not released because the request failed a verification/review guard", reason: outcome.status });
      return;
    }
    res.json({
      ok: true,
      duplicate: outcome.duplicate,
      ...("id" in outcome ? { releaseId: outcome.id, amountMinor: outcome.amountMinor, currency: outcome.currency } : {}),
      message: outcome.kind === "already_released" ? "This sale release was already approved." : "Sale release approved and recorded in the immutable TS Pay ledger.",
    });
  } catch (error) { next(error); }
});

export default router;
