import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { emitDomainEvent } from "../lib/domain-events";

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
  const reservedQuantity = requests.reduce((sum, request) =>
    ["pending", "approved", "received", "completed"].includes(String(request.status))
      ? sum + Math.max(0, Number(request.quantity) || 0) : sum, 0);
  const remainingReturnableQuantity = Math.max(0, purchased - reservedQuantity);
  const fulfillmentStatus = String(order.fulfillment_status ?? "not_applicable");
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
          fj.delivered_at AS fulfillment_delivered_at,
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
      if (!deliveryDate || String(order.fulfillment_status) !== "delivered") {
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

export default router;
