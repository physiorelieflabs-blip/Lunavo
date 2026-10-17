import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, eq, or, sql } from "drizzle-orm";
import { db, merchantsTable } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { requirePermission } from "../lib/tenant-access";
import { emitDomainEvent } from "../lib/domain-events";
import { decideReturnRefund } from "../lib/customer-return-refund-policy";

const router = Router();
const REASONS = ["damaged", "wrong_item", "not_as_described", "arrived_late", "changed_mind", "size_fit", "other"] as const;
const REQUEST_TYPES = ["return", "exchange"] as const;
type Reason = typeof REASONS[number];
type RequestType = typeof REQUEST_TYPES[number];
type Row = Record<string, unknown>;

function record(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function uuid(value: unknown): string | null {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result) ? result : null;
}
function boundedText(value: unknown, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return null;
  const result = value.trim();
  if (result.length > max || result.includes(String.fromCharCode(0))) return null;
  return result || null;
}
function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
function deliveredAt(order: Row): Date | null {
  const value = order.fulfillment_delivered_at ??
    (order.fulfillment_status === "delivered" ? order.fulfillment_updated_at : null);
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
function daysSince(date: Date, now = Date.now()): number {
  return Math.max(0, Math.floor((now - date.getTime()) / 86_400_000));
}
function tokenParam(value: unknown): string | null {
  return uuid(value);
}

async function merchantFor(req: Request, res: Response) {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  const [merchant] = await db.select({ id: merchantsTable.id })
    .from(merchantsTable)
    .where(and(
      eq(merchantsTable.status, "active"),
      or(eq(merchantsTable.localAuthUserId, userId), eq(merchantsTable.clerkUserId, userId)),
    )).limit(1);
  if (!merchant) { res.status(404).json({ error: "Merchant workspace not found" }); return null; }
  try { await requirePermission(userId, merchant.id, "orders.manage"); }
  catch { res.status(403).json({ error: "Permission required: orders.manage" }); return null; }
  return { merchantId: merchant.id, userId };
}

async function findOrder(token: string) {
  const result = await db.execute(sql`
    SELECT
      o.id AS order_id,
      o.merchant_id,
      o.customer_id,
      o.order_number,
      o.currency,
      o.total,
      o.quantity,
      o.status AS order_status,
      o.fulfillment_status,
      o.tracking_number AS order_tracking_number,
      o.fulfillment_note,
      o.fulfillment_updated_at,
      COALESCE((SELECT SUM(rr.quantity) FROM customer_return_requests rr WHERE rr.merchant_id=o.merchant_id AND rr.order_id=o.id AND rr.status IN ('pending','approved','received','completed')),0)::int AS reserved_return_quantity,
      o.created_at AS order_created_at,
      m.store_name,
      m.storefront_theme,
      m.storefront_published,
      m.returns_enabled,
      m.return_window_days,
      sp.title AS product_title,
      sp.image_url AS product_image_url,
      fj.status AS fulfillment_job_status,
      fj.carrier AS fulfillment_carrier,
      fj.tracking_number AS job_tracking_number,
      fj.tracking_url AS job_tracking_url,
      fj.shipped_at AS fulfillment_shipped_at,
      fj.delivered_at AS fulfillment_delivered_at
    FROM orders o
    JOIN merchants m ON m.id=o.merchant_id AND m.status='active'
    LEFT JOIN supplier_products sp ON sp.id=o.supplier_product_id AND sp.merchant_id=o.merchant_id
    LEFT JOIN fulfillment_jobs fj ON fj.order_id=o.id AND fj.merchant_id=o.merchant_id
    WHERE o.public_payment_token=${token}
    LIMIT 1
  `);
  const rows = (result as { rows?: Row[] }).rows ?? [];
  return rows[0] ?? null;
}

function serializePortal(order: Row, requests: Row[]) {
  const delivered = deliveredAt(order);
  const theme = record(order.storefront_theme) ? order.storefront_theme : {};
  const accentRaw = typeof theme.accentColor === "string" ? theme.accentColor : "#b8873b";
  const accentColor = /^#[0-9a-f]{6}$/i.test(accentRaw) ? accentRaw : "#b8873b";
  const rawWindow = Number(order.return_window_days);
  const windowDays = Number.isInteger(rawWindow) ? Math.max(0, Math.min(180, rawWindow)) : 30;
  const returnsEnabled = order.returns_enabled === true && windowDays > 0;
  const ageDays = delivered ? daysSince(delivered) : null;
  const windowOpen = Boolean(returnsEnabled && delivered && ageDays !== null && ageDays <= windowDays);
  const purchased = Math.max(0, Number(order.quantity) || 0);
  const reservedQuantity = Math.max(0, Number(order.reserved_return_quantity) || 0);
  const remainingReturnableQuantity = Math.max(0, purchased - reservedQuantity);
  const orderFulfillmentStatus = String(order.fulfillment_status ?? "not_applicable");
  const fulfillmentStatus = String(order.fulfillment_job_status ?? "") === "delivered" || orderFulfillmentStatus === "delivered"
    ? "delivered" : orderFulfillmentStatus;
  const displayStatus = fulfillmentStatus === "delivered"
    ? "delivered"
    : fulfillmentStatus === "in_transit"
      ? "in_transit"
      : fulfillmentStatus === "shipped"
        ? "shipped"
        : fulfillmentStatus === "failed"
          ? "delivery_issue"
          : fulfillmentStatus === "canceled"
            ? "cancelled"
            : String(order.order_status ?? "pending");
  return {
    store: {
      name: String(order.store_name ?? "Store"),
      accentColor,
      storefrontPublished: order.storefront_published === true,
    },
    order: {
      orderNumber: String(order.order_number ?? ""),
      createdAt: order.order_created_at,
      currency: String(order.currency ?? "USD"),
      total: String(order.total ?? "0"),
      quantity: purchased,
      status: String(order.order_status ?? "pending"),
      fulfillmentStatus,
      displayStatus,
      product: order.product_title ? {
        title: String(order.product_title),
        imageUrl: typeof order.product_image_url === "string" ? safeHttpsUrl(order.product_image_url) : null,
      } : null,
      tracking: {
        carrier: typeof order.fulfillment_carrier === "string" ? order.fulfillment_carrier : null,
        number: typeof order.job_tracking_number === "string" ? order.job_tracking_number
          : typeof order.order_tracking_number === "string" ? order.order_tracking_number : null,
        url: safeHttpsUrl(order.job_tracking_url),
        shippedAt: order.fulfillment_shipped_at ?? null,
        deliveredAt: delivered?.toISOString() ?? null,
      },
    },
    returns: {
      enabled: returnsEnabled,
      windowDays,
      daysSinceDelivery: ageDays,
      windowOpen,
      remainingQuantity: remainingReturnableQuantity,
      requests: requests.map(request => ({
        id: request.id,
        type: request.request_type,
        quantity: Number(request.quantity),
        reason: request.reason,
        customerMessage: request.customer_message,
        status: request.status,
        createdAt: request.created_at,
        updatedAt: request.updated_at,
      })),
    },
    privacy: "This token grants access only to this order's limited status. Customer email, phone and shipping address are not exposed.",
  };
}

router.get("/public/order-portal/:token", async (req: Request, res: Response, next) => {
  try {
    const token = tokenParam(req.params.token);
    if (!token) { res.status(404).json({ error: "Order portal not found." }); return; }
    const order = await findOrder(token);
    if (!order) { res.status(404).json({ error: "Order portal not found." }); return; }
    const result = await db.execute(sql`
      SELECT id,request_type,quantity,reason,customer_message,status,created_at,updated_at
      FROM customer_return_requests
      WHERE merchant_id=${Number(order.merchant_id)} AND order_id=${Number(order.order_id)}
      ORDER BY created_at DESC
      LIMIT 30
    `);
    const requests = (result as { rows?: Row[] }).rows ?? [];
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.json(serializePortal(order, requests));
  } catch (error) {
    next(error);
  }
});

router.post("/public/order-portal/:token/returns", async (req: Request, res: Response, next) => {
  try {
    const token = tokenParam(req.params.token);
    if (!token) { res.status(404).json({ error: "Order portal not found." }); return; }
    const body = record(req.body) ? req.body : {};
    const requestType = typeof body.requestType === "string" && REQUEST_TYPES.includes(body.requestType as RequestType)
      ? body.requestType as RequestType : null;
    const reason = typeof body.reason === "string" && REASONS.includes(body.reason as Reason)
      ? body.reason as Reason : null;
    const quantity = Number(body.quantity);
    const idempotencyKey = uuid(body.idempotencyKey);
    const customerMessage = boundedText(body.customerMessage, 2000);
    if (!requestType || !reason || !Number.isSafeInteger(quantity) || quantity < 1 ||
        !idempotencyKey ||
        (body.customerMessage !== undefined && body.customerMessage !== null && body.customerMessage !== "" && customerMessage === null)) {
      res.status(400).json({ error: "Choose a request type, reason, valid quantity and idempotency key." });
      return;
    }
    const result = await db.transaction(async tx => {
      const lockedResult = await tx.execute(sql`
        SELECT o.id AS order_id,o.merchant_id,o.customer_id,o.order_number,o.quantity,
          o.status AS order_status,o.fulfillment_status,o.fulfillment_updated_at,
          fj.delivered_at AS fulfillment_delivered_at,fj.status AS fulfillment_job_status,
          m.returns_enabled,m.return_window_days
        FROM orders o
        JOIN merchants m ON m.id=o.merchant_id AND m.status='active'
        LEFT JOIN fulfillment_jobs fj ON fj.order_id=o.id AND fj.merchant_id=o.merchant_id
        WHERE o.public_payment_token=${token}
        LIMIT 1 FOR UPDATE OF o
      `);
      const order = ((lockedResult as { rows?: Row[] }).rows ?? [])[0];
      if (!order) return { status: 404, body: { error: "Order portal not found." } };

      const fingerprintInput = { orderId: Number(order.order_id), requestType, reason, quantity, customerMessage };
      const fingerprint = createHash("sha256").update(JSON.stringify(fingerprintInput)).digest("hex");
      const existingResult = await tx.execute(sql`
        SELECT id,order_id,request_type,quantity,reason,customer_message,status,created_at,updated_at,request_fingerprint
        FROM customer_return_requests
        WHERE merchant_id=${Number(order.merchant_id)} AND idempotency_key=${idempotencyKey}
        LIMIT 1
      `);
      const existing = ((existingResult as { rows?: Row[] }).rows ?? [])[0];
      if (existing) {
        if (String(existing.request_fingerprint) !== fingerprint || Number(existing.order_id) !== Number(order.order_id)) {
          return { status: 409, body: { error: "This idempotency key was already used for another return request." } };
        }
        return { status: 200, body: { request: existing, replayed: true, executionBoundary: "request_record_only_no_refund_or_restock" } };
      }

      const deliveryDate = deliveredAt(order);
      if (order.returns_enabled !== true || Number(order.return_window_days) <= 0) {
        return { status: 409, body: { error: "This store is not currently accepting return/exchange requests." } };
      }
      if (!deliveryDate || (String(order.fulfillment_status) !== "delivered" && String(order.fulfillment_job_status) !== "delivered")) {
        return { status: 409, body: { error: "Return/exchange requests are available after delivery is recorded." } };
      }
      const windowDays = Math.max(0, Math.min(180, Number(order.return_window_days) || 0));
      if (daysSince(deliveryDate) > windowDays) {
        return { status: 409, body: { error: "The store's return window has closed." } };
      }
      const purchasedQuantity = Math.max(0, Number(order.quantity) || 0);
      if (quantity > purchasedQuantity) {
        return { status: 400, body: { error: "Requested quantity exceeds the order quantity." } };
      }
      const reservedResult = await tx.execute(sql`
        SELECT COALESCE(SUM(quantity),0)::int AS requested_quantity
        FROM customer_return_requests
        WHERE merchant_id=${Number(order.merchant_id)}
          AND order_id=${Number(order.order_id)}
          AND status IN ('pending','approved','received','completed')
      `);
      const reserved = Number((((reservedResult as { rows?: Row[] }).rows ?? [])[0]?.requested_quantity) ?? 0);
      if (quantity > purchasedQuantity - reserved) {
        return { status: 409, body: { error: "There is not enough unrequested quantity remaining on this order." } };
      }
      const inserted = await tx.execute(sql`
        INSERT INTO customer_return_requests (
          merchant_id,order_id,request_type,quantity,reason,customer_message,status,
          return_window_days_snapshot,request_fingerprint,idempotency_key
        ) VALUES (
          ${Number(order.merchant_id)},${Number(order.order_id)},${requestType},${quantity},${reason},${customerMessage},
          'pending',${windowDays},${fingerprint},${idempotencyKey}
        )
        ON CONFLICT (merchant_id,idempotency_key) DO NOTHING
        RETURNING id,request_type,quantity,reason,customer_message,status,created_at,updated_at
      `);
      const created = ((inserted as { rows?: Row[] }).rows ?? [])[0];
      if (!created) return { status: 409, body: { error: "The request was claimed concurrently. Retry with the same idempotency key." } };

      await emitDomainEvent(tx, {
        merchantId: Number(order.merchant_id),
        eventType: "merchant.operation.created",
        aggregateType: "customer_return_request",
        aggregateId: String(created.id),
        actorType: "customer",
        actorId: String(order.customer_id),
        source: "public_customer_api",
        idempotencyKey: "customer-return-request:" + String(created.id) + ":created",
        payload: {
          orderId: Number(order.order_id),
          orderNumber: String(order.order_number),
          requestType,
          quantity,
          reason,
          status: "pending",
        },
      });
      return { status: 201, body: { request: created, replayed: false, executionBoundary: "request_record_only_no_refund_no_restock_no_supplier_contact" } };
    });
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

router.get("/merchant/order-portal/return-requests", async (req: Request, res: Response, next) => {
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const requested = Number(req.query.limit ?? 100);
    const limit = Number.isInteger(requested) ? Math.max(1, Math.min(200, requested)) : 100;
    const result = await db.execute(sql`
      SELECT r.id,r.order_id,r.request_type,r.quantity,r.reason,r.customer_message,r.status,
        r.return_window_days_snapshot,r.resolution_note,r.reviewed_by,r.reviewed_at,r.created_at,r.updated_at,
        r.inspection_grade,r.inspection_note,r.inspected_at,r.refund_record_id,
        fr.status AS refund_status,fr.amount_minor AS refund_amount_minor,fr.currency AS refund_currency,
        fr.inventory_restock AS refund_inventory_restock,
        o.order_number,o.quantity AS purchased_quantity,o.currency,o.total AS order_total,o.fulfillment_status,
        p.title AS product_title,c.name AS customer_name,c.email AS customer_email
      FROM customer_return_requests r
      JOIN orders o ON o.id=r.order_id AND o.merchant_id=r.merchant_id
      LEFT JOIN supplier_products p ON p.id=o.supplier_product_id AND p.merchant_id=o.merchant_id
      LEFT JOIN refund_records fr ON fr.id=r.refund_record_id AND fr.merchant_id=r.merchant_id
      JOIN customers c ON c.id=o.customer_id AND c.merchant_id=o.merchant_id
      WHERE r.merchant_id=${ctx.merchantId}
      ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'received' THEN 2 ELSE 3 END,
        r.created_at DESC
      LIMIT ${limit}
    `);
    res.setHeader("Cache-Control", "no-store, private");
    res.json({ requests: (result as { rows?: Row[] }).rows ?? [] });
  } catch (error) { next(error); }
});

router.post("/merchant/order-portal/return-requests/:id/prepare-refund", async (req: Request, res: Response, next) => {
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const id = uuid(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid return request id." }); return; }
    try { await requirePermission(ctx.userId, ctx.merchantId, "refunds.manage"); }
    catch { res.status(403).json({ error: "Permission required: refunds.manage" }); return; }

    const body = record(req.body) ? req.body : {};
    const inspectionGrade = boundedText(body.inspectionGrade, 24);
    const inspectionNote = boundedText(body.inspectionNote, 2000);
    const amountMinor = body.refundAmountMinor;
    const restockReturnedItems = body.restockReturnedItems === true;
    if (!["resellable", "damaged", "unsellable"].includes(String(inspectionGrade)) ||
        !Number.isSafeInteger(amountMinor) || Number(amountMinor) <= 0 ||
        (body.inspectionNote !== undefined && body.inspectionNote !== null &&
          body.inspectionNote !== "" && inspectionNote === null)) {
      res.status(400).json({ error: "Choose an inspection result and enter a positive refund amount in currency minor units." });
      return;
    }

    const result = await db.transaction(async tx => {
      const found = await tx.execute(sql`
        SELECT id,order_id,request_type,quantity,reason,status,refund_record_id
        FROM customer_return_requests
        WHERE id=${id}::uuid AND merchant_id=${ctx.merchantId}
        LIMIT 1 FOR UPDATE
      `);
      const request = ((found as { rows?: Row[] }).rows ?? [])[0];
      if (!request) return { status: 404, body: { error: "Return request not found." } };

      if (request.refund_record_id != null) {
        const linkedResult = await tx.execute(sql`
          SELECT id,status,amount_minor,currency,inventory_restock,provider_status,provider_refund_id
          FROM refund_records
          WHERE id=${Number(request.refund_record_id)} AND merchant_id=${ctx.merchantId}
          LIMIT 1
        `);
        const linkedRefund = ((linkedResult as { rows?: Row[] }).rows ?? [])[0];
        if (!linkedRefund) throw new Error("Linked refund record is missing; contact support before retrying.");
        return { status: 200, body: { refund: linkedRefund, returnRequestId: id, replayed: true } };
      }

      if (String(request.status) !== "received") {
        return { status: 409, body: { error: "The returned item must be physically received before inspection and refund preparation." } };
      }
      if (String(request.request_type) !== "return") {
        return { status: 409, body: { error: "This is an exchange request. Cash refunds are not created for exchange cases by this workflow." } };
      }

      const paymentResult = await tx.execute(sql`
        SELECT
          o.id AS order_id,o.quantity AS purchased_quantity,o.currency AS order_currency,o.supplier_product_id,o.location_id,
          pr.id AS payment_record_id,pr.amount_minor AS settlement_amount_minor,
          pr.currency AS settlement_currency,pr.status AS payment_status,
          pi.amount_minor AS payment_intent_amount_minor,pi.currency AS payment_intent_currency,
          pi.status AS payment_intent_status,
          p.inventory_strategy,p.availability_quantity
        FROM orders o
        JOIN payment_records pr ON pr.order_id=o.id AND pr.merchant_id=o.merchant_id
          AND pr.status IN ('verified','partially_refunded','refunded')
        JOIN payment_intents pi ON pi.id=pr.intent_id AND pi.order_id=o.id AND pi.merchant_id=o.merchant_id
          AND pi.status IN ('verified','partially_refunded','refunded')
        LEFT JOIN supplier_products p ON p.id=o.supplier_product_id AND p.merchant_id=o.merchant_id
        WHERE o.id=${Number(request.order_id)} AND o.merchant_id=${ctx.merchantId}
        ORDER BY pr.created_at DESC
        LIMIT 1
        FOR UPDATE OF o,pr,pi
      `);
      const payment = ((paymentResult as { rows?: Row[] }).rows ?? [])[0];
      if (!payment) {
        return { status: 409, body: { error: "A verified provider/payment record was not found for this order. No refund has been created." } };
      }
      if (String(payment.order_currency).trim().toUpperCase() !== String(payment.payment_intent_currency).trim().toUpperCase()) {
        return { status: 409, body: { error: "Order and transaction currencies differ. Use manual finance reconciliation for this return." } };
      }

      const previousResult = await tx.execute(sql`
        SELECT COALESCE(SUM(amount_minor),0)::bigint AS total
        FROM refund_records
        WHERE merchant_id=${ctx.merchantId}
          AND payment_record_id=${Number(payment.payment_record_id)}
          AND status IN ('requested','approved','processed')
      `);
      const priorRefundAmountMinor = Number((((previousResult as { rows?: Row[] }).rows ?? [])[0]?.total) ?? 0);

      const decision = decideReturnRefund({
        requestType: String(request.request_type),
        requestStatus: String(request.status),
        requestedQuantity: Number(request.quantity),
        purchasedQuantity: Number(payment.purchased_quantity),
        inspectionGrade: String(inspectionGrade),
        amountMinor: Number(amountMinor),
        paidAmountMinor: Number(payment.payment_intent_amount_minor),
        priorRefundAmountMinor,
        paymentCurrency: String(payment.payment_intent_currency),
        paymentIntentAmountMinor: Number(payment.payment_intent_amount_minor),
        paymentIntentCurrency: String(payment.payment_intent_currency),
        settlementAmountMinor: Number(payment.settlement_amount_minor),
        settlementCurrency: String(payment.settlement_currency),
        restockReturnedItems,
        inventoryStrategy: payment.inventory_strategy == null ? null : String(payment.inventory_strategy),
        availabilityQuantity: payment.availability_quantity == null ? null : Number(payment.availability_quantity),
      });
      if (!decision.ok) return { status: 409, body: { error: decision.reason } };

      const refundResult = await tx.execute(sql`
        INSERT INTO refund_records (
          merchant_id,order_id,payment_record_id,amount_minor,currency,status,reason,
          inventory_restock,requested_by
        ) VALUES (
          ${ctx.merchantId},${Number(request.order_id)},${Number(payment.payment_record_id)},
          ${Number(amountMinor)},${String(payment.payment_intent_currency)},'requested',
          ${"Return request " + id + " (" + String(request.reason) + "; inspection " + String(inspectionGrade) + ")"},
          ${decision.inventoryRestock},${ctx.userId}
        )
        RETURNING id,status,amount_minor,currency,inventory_restock,provider_status,provider_refund_id
      `);
      const refund = ((refundResult as { rows?: Row[] }).rows ?? [])[0];
      if (!refund) throw new Error("Refund request could not be recorded");

      const updated = await tx.execute(sql`
        UPDATE customer_return_requests
        SET inspection_grade=${String(inspectionGrade)},
            inspection_note=${inspectionNote},
            inspected_at=now(),
            refund_record_id=${Number(refund.id)},
            updated_at=now()
        WHERE id=${id}::uuid AND merchant_id=${ctx.merchantId}
          AND status='received' AND refund_record_id IS NULL
        RETURNING id
      `);
      if (!(((updated as { rows?: Row[] }).rows ?? []).length)) {
        throw new Error("Return request changed while preparing the refund; the transaction has been rolled back.");
      }

      await tx.execute(sql`
        INSERT INTO commerce_transition_history (
          merchant_id,order_id,refund_id,entity_type,from_status,to_status,actor_id,note
        ) VALUES (
          ${ctx.merchantId},${Number(request.order_id)},${Number(refund.id)},
          'customer_return_refund','received','requested',${ctx.userId},
          ${"inspection=" + String(inspectionGrade) + "; inventoryRestock=" + String(decision.inventoryRestock)}
        )
      `);
      await emitDomainEvent(tx, {
        merchantId: ctx.merchantId,
        eventType: "merchant.operation.transitioned",
        aggregateType: "customer_return_request",
        aggregateId: id,
        actorType: "merchant",
        actorId: ctx.userId,
        source: "merchant_api",
        idempotencyKey: "customer-return-request:" + id + ":refund-requested",
        payload: {
          status: "received",
          resolution: "refund_requested",
          refundRecordId: Number(refund.id),
          amountMinor: Number(amountMinor),
          currency: String(payment.payment_currency),
          inspectionGrade: String(inspectionGrade),
          inventoryRestock: decision.inventoryRestock,
        },
      });

      return { status: 201, body: { refund, returnRequestId: id, replayed: false } };
    });

    res.setHeader("Cache-Control", "no-store, private");
    res.status(result.status).json(result.body);
  } catch (error) { next(error); }
});

router.patch("/merchant/order-portal/return-requests/:id", async (req: Request, res: Response, next) => {
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const id = uuid(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid return request id." }); return; }
    const body = record(req.body) ? req.body : {};
    const action = boundedText(body.action, 24);
    const resolutionNote = boundedText(body.resolutionNote, 2000);
    const transitions: Record<string, { from: string[]; to: string }> = {
      approve: { from: ["pending"], to: "approved" },
      reject: { from: ["pending"], to: "rejected" },
      mark_received: { from: ["approved"], to: "received" },
      complete: { from: ["received"], to: "completed" },
      cancel: { from: ["pending", "approved"], to: "cancelled" },
    };
    const transition = action ? transitions[action] : null;
    if (!transition) {
      res.status(400).json({ error: "Use approve, reject, mark_received, complete or cancel." });
      return;
    }
    if (action === "reject" && !resolutionNote) {
      res.status(400).json({ error: "A reason is required when rejecting a return/exchange request." });
      return;
    }
    const updated = await db.transaction(async tx => {
      const found = await tx.execute(sql`
        SELECT id,order_id,merchant_id,status,request_type,quantity,reason,created_at
        FROM customer_return_requests
        WHERE id=${id}::uuid AND merchant_id=${ctx.merchantId}
        LIMIT 1 FOR UPDATE
      `);
      const current = ((found as { rows?: Row[] }).rows ?? [])[0];
      if (!current) return { status: 404, body: { error: "Return request not found." } };
      if (action === "complete" && String(current.request_type) === "return") {
        return { status: 409, body: { error: "A return is completed by processing its linked refund; do not complete it manually." } };
      }
      if (!transition.from.includes(String(current.status))) {
        return { status: 409, body: { error: "This return request cannot make that status transition.", currentStatus: String(current.status) } };
      }
      const next = await tx.execute(sql`
        UPDATE customer_return_requests
        SET status=${transition.to},
          resolution_note=CASE WHEN ${resolutionNote}::text IS NOT NULL THEN ${resolutionNote} ELSE resolution_note END,
          reviewed_by=${ctx.userId},
          reviewed_at=now(),
          updated_at=now()
        WHERE id=${id}::uuid AND merchant_id=${ctx.merchantId} AND status=${String(current.status)}
        RETURNING id,order_id,request_type,quantity,reason,status,resolution_note,reviewed_by,reviewed_at,updated_at
      `);
      const row = ((next as { rows?: Row[] }).rows ?? [])[0];
      if (!row) return { status: 409, body: { error: "The request changed concurrently. Reload and retry." } };
      await emitDomainEvent(tx, {
        merchantId: ctx.merchantId,
        eventType: "merchant.operation.transitioned",
        aggregateType: "customer_return_request",
        aggregateId: id,
        actorType: "merchant",
        actorId: ctx.userId,
        source: "merchant_api",
        idempotencyKey: "customer-return-request:" + id + ":" + transition.to,
        payload: {
          previousStatus: String(current.status),
          status: transition.to,
          requestType: String(current.request_type),
          quantity: Number(current.quantity),
          orderId: Number(current.order_id),
          resolution: action,
        },
      });
      return {
        status: 200,
        body: {
          request: row,
          persisted: true,
          executionBoundary: "status_record_only_no_provider_refund_no_ledger_mutation_no_inventory_restock",
        },
      };
    });
    res.setHeader("Cache-Control", "no-store, private");
    res.status(updated.status).json(updated.body);
  } catch (error) { next(error); }
});

export default router;
