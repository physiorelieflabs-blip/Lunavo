import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { requirePermission } from "../lib/tenant-access";
import { completeDeepSeekChat } from "../lib/deepseek";
import { productEconomics, scoreSupplier, trackingGap } from "../lib/dropship-intelligence-core";

const router = Router();

function fail(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}
function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function integer(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}
function moneyMinor(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 100))) return null;
  return Math.round(n * 100);
}
function score(value: unknown): number | null {
  return integer(value, 0, 100);
}
function optionalDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}
async function merchantFor(req: Request) {
  const userId = getAuth(req).userId;
  if (!userId) return null;
  const row = (await db.execute(sql`
    SELECT id,email
    FROM merchants
    WHERE status='active' AND (clerk_user_id=${userId} OR local_auth_user_id=${userId})
    LIMIT 1
  `)).rows[0] as { id: number; email: string } | undefined;
  if (!row) return null;
  await requirePermission(userId, row.id, "team.manage");
  return { ...row, userId };
}

router.get("/public/supplier-intelligence/:domain", async (req, res, next) => {
  try {
    const domain=text(req.params.domain,160).toLowerCase();
    if(!domain || !/^[a-z0-9.-]+$/.test(domain)) return fail(res,400,"Invalid supplier domain");
    const row=(await db.execute(sql`
      SELECT
        COUNT(*)::int AS observations,
        COUNT(DISTINCT merchant_id)::int AS merchants,
        ROUND(AVG(quality_score))::int AS quality_score,
        ROUND(AVG(tracking_score))::int AS tracking_score,
        ROUND(AVG(defect_rate_bps))::int AS defect_rate_bps,
        ROUND(AVG(refund_rate_bps))::int AS refund_rate_bps,
        ROUND(AVG(eta_max_days))::int AS eta_max_days,
        MIN(observed_at) AS evidence_since,
        MAX(observed_at) AS last_observed_at
      FROM dropship_supplier_observations
      WHERE share_with_supplier_network=true AND lower(supplier_domain)=${domain}
    `)).rows[0] as Record<string,unknown> | undefined;
    const merchants=Number(row?.merchants??0), observations=Number(row?.observations??0);
    if(merchants<3) return res.status(404).json({error:"Not enough independent network evidence to publish this supplier passport",minimumIndependentMerchants:3});
    const passport=scoreSupplier({
      qualityScore:row?.quality_score==null?null:Number(row.quality_score),
      trackingScore:row?.tracking_score==null?null:Number(row.tracking_score),
      lateRateBps:null,
      defectRateBps:row?.defect_rate_bps==null?null:Number(row.defect_rate_bps),
      observations,
      fulfilledOrders:0,
    });
    res.json({
      supplierDomain:domain,
      passport,
      independentMerchants:merchants,
      observations,
      qualityScore:row?.quality_score==null?null:Number(row.quality_score),
      trackingScore:row?.tracking_score==null?null:Number(row.tracking_score),
      defectRateBps:row?.defect_rate_bps==null?null:Number(row.defect_rate_bps),
      refundRateBps:row?.refund_rate_bps==null?null:Number(row.refund_rate_bps),
      etaMaxDays:row?.eta_max_days==null?null:Number(row.eta_max_days),
      evidenceSince:row?.evidence_since,
      lastObservedAt:row?.last_observed_at,
      privacy:"Only aggregated evidence from merchants who opted into the supplier reputation network is exposed."
    });
  } catch(error){next(error);}
});

router.get("/dropship-intelligence/overview", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req);
    if (!merchant) return fail(res, 401, "Authentication required");

    const [products, suppliers, switchboard, tracking, alerts] = await Promise.all([
      db.execute(sql`
        SELECT p.id,p.title,p.source_domain,p.source_url,p.price,p.selling_price,p.currency,
               p.availability,p.availability_quantity,p.inventory_status,p.status,p.visibility,
               o.observed_cost_minor,o.shipping_cost_minor,o.eta_min_days,o.eta_max_days,
               o.quality_score,o.tracking_score,o.defect_rate_bps,o.refund_rate_bps,
               o.destination_country,o.observed_at AS observation_at,
               g.ad_spend_per_order_minor,g.target_margin_bps,g.max_delivery_days,g.status AS guardrail_status,
               g.decision AS guardrail_decision,g.viability_score,g.break_even_cpa_minor,
               g.break_even_roas_x100,g.reasons,g.updated_at AS guardrail_updated_at
        FROM supplier_products p
        LEFT JOIN LATERAL (
          SELECT observed_cost_minor,shipping_cost_minor,eta_min_days,eta_max_days,
                 quality_score,tracking_score,defect_rate_bps,refund_rate_bps,
                 destination_country,observed_at
          FROM dropship_supplier_observations
          WHERE merchant_id=${merchant.id} AND supplier_product_id=p.id
          ORDER BY observed_at DESC
          LIMIT 1
        ) o ON true
        LEFT JOIN dropship_product_guardrails g
          ON g.merchant_id=p.merchant_id AND g.supplier_product_id=p.id
        WHERE p.merchant_id=${merchant.id}
          AND p.status='active'
          AND p.visibility='active'
        ORDER BY p.updated_at DESC
        LIMIT 250
      `),
      db.execute(sql`
        SELECT o.supplier_domain,
               MAX(COALESCE(o.supplier_name,o.supplier_domain)) AS supplier_name,
               COUNT(*)::int AS observations,
               ROUND(AVG(o.quality_score))::int AS quality_score,
               ROUND(AVG(o.tracking_score))::int AS tracking_score,
               ROUND(AVG(o.defect_rate_bps))::int AS defect_rate_bps,
               ROUND(AVG(o.refund_rate_bps))::int AS refund_rate_bps,
               ROUND(AVG(o.eta_max_days))::int AS eta_max_days,
               COUNT(DISTINCT o.supplier_product_id)::int AS products_observed,
               COALESCE(MAX(f.fulfilled_orders),0)::int AS fulfilled_orders,
               COALESCE(MAX(f.delivered_orders),0)::int AS delivered_orders,
               MAX(o.observed_at) AS last_observed_at
        FROM dropship_supplier_observations o
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS fulfilled_orders,
                 SUM(CASE WHEN fj.status='delivered' THEN 1 ELSE 0 END)::int AS delivered_orders
          FROM fulfillment_jobs fj
          JOIN supplier_products sp ON sp.id=fj.supplier_product_id
          WHERE fj.merchant_id=${merchant.id} AND sp.source_domain=o.supplier_domain
        ) f ON true
        WHERE o.merchant_id=${merchant.id}
        GROUP BY o.supplier_domain
        ORDER BY last_observed_at DESC
        LIMIT 100
      `),
      db.execute(sql`
        SELECT fj.order_id,o.order_number,fj.status,fj.carrier,fj.tracking_number,
               fj.shipped_at,fj.delivered_at,fj.updated_at,
               t.last_recorded_at,t.expected_delivery_at,t.last_recorded_event,t.note
        FROM fulfillment_jobs fj
        JOIN orders o ON o.id=fj.order_id AND o.merchant_id=fj.merchant_id
        LEFT JOIN dropship_tracking_checkpoints t
          ON t.merchant_id=fj.merchant_id AND t.order_id=fj.order_id
        WHERE fj.merchant_id=${merchant.id}
          AND fj.status IN ('shipped','in_transit','accepted','processing')
        ORDER BY COALESCE(t.last_recorded_at,fj.updated_at) ASC
        LIMIT 100
      `),
      db.execute(sql`
        SELECT id,kind,severity,entity_type,entity_id,title,message,status,evidence,created_at,updated_at
        FROM dropship_alerts
        WHERE merchant_id=${merchant.id} AND status <> 'resolved'
        ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'warning' THEN 3 ELSE 4 END, updated_at DESC
        LIMIT 100
      `),
    ]);

    const productRows = (products.rows as Array<Record<string, unknown>>).map((row) => {
      const result = productEconomics({
        sellingPriceMinor: Number(row.selling_price ?? 0) * 100,
        supplierCostMinor: row.observed_cost_minor == null && row.price == null ? null : Number(row.observed_cost_minor ?? Number(row.price) * 100),
        shippingCostMinor: row.shipping_cost_minor == null ? null : Number(row.shipping_cost_minor),
        adSpendPerOrderMinor: row.ad_spend_per_order_minor == null ? null : Number(row.ad_spend_per_order_minor),
        targetMarginBps: row.target_margin_bps == null ? 2000 : Number(row.target_margin_bps),
        supplierQualityScore: row.quality_score == null ? null : Number(row.quality_score),
        supplierTrackingScore: row.tracking_score == null ? null : Number(row.tracking_score),
        etaMaxDays: row.eta_max_days == null ? null : Number(row.eta_max_days),
        stockQuantity: row.availability_quantity == null ? null : Number(row.availability_quantity),
        stockStatus: String(row.availability ?? row.inventory_status ?? ""),
        refundRateBps: row.refund_rate_bps == null ? null : Number(row.refund_rate_bps),
      });
      return {
        id: Number(row.id),
        title: String(row.title),
        supplierDomain: String(row.source_domain),
        sourceUrl: String(row.source_url),
        currency: String(row.currency),
        sellingPrice: Number(row.selling_price ?? 0),
        supplierCost: row.observed_cost_minor == null ? row.price == null ? null : Number(row.price) : Number(row.observed_cost_minor) / 100,
        shippingCost: row.shipping_cost_minor == null ? null : Number(row.shipping_cost_minor) / 100,
        availability: row.availability,
        availabilityQuantity: row.availability_quantity,
        observationAt: row.observation_at,
        economics: result,
        guardrail: {
          status: String(row.guardrail_status ?? "live"),
          decision: row.guardrail_decision ?? null,
          viabilityScore: row.viability_score == null ? result.viabilityScore : Number(row.viability_score),
          breakEvenCpaMinor: row.break_even_cpa_minor == null ? result.breakEvenCpaMinor : Number(row.break_even_cpa_minor),
          breakEvenRoasX100: row.break_even_roas_x100 == null ? result.breakEvenRoasX100 : Number(row.break_even_roas_x100),
          reasons: Array.isArray(row.reasons) ? row.reasons : result.reasons,
          updatedAt: row.guardrail_updated_at,
        },
      };
    });

    const supplierRows = (suppliers.rows as Array<Record<string, unknown>>).map((row) => ({
      domain: String(row.supplier_domain),
      name: String(row.supplier_name ?? row.supplier_domain),
      observations: Number(row.observations),
      productsObserved: Number(row.products_observed),
      fulfilledOrders: Number(row.fulfilled_orders),
      deliveredOrders: Number(row.delivered_orders),
      qualityScore: row.quality_score == null ? null : Number(row.quality_score),
      trackingScore: row.tracking_score == null ? null : Number(row.tracking_score),
      defectRateBps: row.defect_rate_bps == null ? null : Number(row.defect_rate_bps),
      refundRateBps: row.refund_rate_bps == null ? null : Number(row.refund_rate_bps),
      etaMaxDays: row.eta_max_days == null ? null : Number(row.eta_max_days),
      lastObservedAt: row.last_observed_at,
      passport: scoreSupplier({
        qualityScore: row.quality_score == null ? null : Number(row.quality_score),
        trackingScore: row.tracking_score == null ? null : Number(row.tracking_score),
        lateRateBps: null,
        defectRateBps: row.defect_rate_bps == null ? null : Number(row.defect_rate_bps),
        observations: Number(row.observations),
        fulfilledOrders: Number(row.fulfilled_orders),
      }),
    }));

    const switchboardRows = (switchboard.rows as Array<Record<string, unknown>>).map((row) => ({
      productId: Number(row.supplier_product_id), productTitle: String(row.title), supplierDomain: String(row.supplier_domain), supplierName: String(row.supplier_name),
      supplierCost: row.observed_cost_minor == null ? null : Number(row.observed_cost_minor)/100,
      shippingCost: row.shipping_cost_minor == null ? null : Number(row.shipping_cost_minor)/100,
      currency: String(row.currency), etaMinDays: row.eta_min_days == null ? null : Number(row.eta_min_days), etaMaxDays: row.eta_max_days == null ? null : Number(row.eta_max_days),
      qualityScore: row.quality_score == null ? null : Number(row.quality_score), trackingScore: row.tracking_score == null ? null : Number(row.tracking_score), observedAt: row.observed_at,
    }));

    const trackingRows = (tracking.rows as Array<Record<string, unknown>>).map((row) => ({
      orderId: Number(row.order_id),
      orderNumber: String(row.order_number),
      status: String(row.status),
      carrier: row.carrier,
      trackingNumber: row.tracking_number,
      shippedAt: row.shipped_at,
      lastRecordedAt: row.last_recorded_at ?? row.updated_at,
      expectedDeliveryAt: row.expected_delivery_at,
      lastRecordedEvent: row.last_recorded_event,
      note: row.note,
      gap: trackingGap({
        status: String(row.status),
        lastRecordedAt: (row.last_recorded_at ?? row.updated_at) as string | Date,
      }),
    }));

    const allAlerts = alerts.rows;
    const openAlertCount = allAlerts.length;
    const criticalAlerts = allAlerts.filter((row: any) => row.severity === "critical").length;

    res.json({
      generatedAt: new Date().toISOString(),
      sourceOfTruth: "Lunavo recorded data",
      products: productRows,
      suppliers: supplierRows,
      tracking: trackingRows,
      alerts: allAlerts,
      metrics: {
        products: productRows.length,
        scale: productRows.filter((p) => p.economics.decision === "SCALE").length,
        test: productRows.filter((p) => p.economics.decision === "TEST").length,
        fix: productRows.filter((p) => p.economics.decision === "FIX").length,
        pause: productRows.filter((p) => p.economics.decision === "PAUSE").length,
        openAlerts: openAlertCount,
        criticalAlerts,
        trackingGaps: trackingRows.filter((t) => t.gap.state !== "healthy" && t.gap.state !== "unknown").length,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/dropship-intelligence/suppliers/negotiate", async (req, res, next) => {
  try {
    const merchant=await merchantFor(req);
    if(!merchant)return fail(res,401,"Authentication required");
    const domain=text(req.body?.supplierDomain,160).toLowerCase();
    const goal=text(req.body?.goal,500)||"Request better landed cost, reliable processing and predictable tracking.";
    const productId=req.body?.supplierProductId==null?null:integer(req.body?.supplierProductId,1,2147483647);
    if(!domain||!/^[a-z0-9.-]+$/.test(domain))return fail(res,400,"Valid supplier domain is required");
    const observations=(await db.execute(sql`
      SELECT supplier_name,source_url,supplier_product_id,observed_cost_minor,shipping_cost_minor,currency,
             eta_min_days,eta_max_days,quality_score,tracking_score,defect_rate_bps,refund_rate_bps,
             destination_country,notes,observed_at
      FROM dropship_supplier_observations
      WHERE merchant_id=${merchant.id} AND lower(supplier_domain)=${domain}
        AND (${productId} IS NULL OR supplier_product_id=${productId})
      ORDER BY observed_at DESC
      LIMIT 12
    `)).rows as Array<Record<string,unknown>>;
    if(!observations.length)return fail(res,404,"No recorded evidence exists for that supplier yet.");
    const evidence=observations.map((o,i)=>`Observation ${i+1}: cost=${o.observed_cost_minor==null?"unknown":Number(o.observed_cost_minor)/100} ${String(o.currency)}; shipping=${o.shipping_cost_minor==null?"unknown":Number(o.shipping_cost_minor)/100} ${String(o.currency)}; ETA=${o.eta_min_days??"?"}-${o.eta_max_days??"?"} days; quality=${o.quality_score??"unknown"}/100; tracking=${o.tracking_score??"unknown"}/100; defects=${o.defect_rate_bps==null?"unknown":Number(o.defect_rate_bps)/100}%; refunds=${o.refund_rate_bps==null?"unknown":Number(o.refund_rate_bps)/100}%; destination=${o.destination_country??"unknown"}; notes=${text(o.notes,700)}`).join("\n");
    const product=(productId==null?null:(await db.execute(sql`SELECT title,selling_price,currency FROM supplier_products WHERE id=${productId} AND merchant_id=${merchant.id} LIMIT 1`)).rows[0]) as {title?:string|null;selling_price?:string|number|null;currency?:string|null}|undefined;
    const response=await completeDeepSeekChat([
      {role:"system",content:"You are Lunavo Supplier Negotiation Copilot. Draft a concise, professional supplier negotiation message using ONLY the evidence supplied. Never invent order volume, competing quotes, supplier failures, legal rights, certifications, delivery guarantees, target prices, or leverage. Ask for measurable concessions such as unit price, shipping price, processing SLA, packaging, sample inspection, photo proof, or tracking updates. Keep unknown facts as questions. Return only the ready-to-send message."},
      {role:"user",content:"Supplier domain: "+domain+"\nGoal: "+goal+"\nProduct: "+(product?.title??"not specified")+"\nRecorded evidence:\n"+evidence}
    ],{maxTokens:1600,reasoningEffort:"high"});
    res.json({supplierDomain:domain,product:product??null,evidenceCount:observations.length,model:response.model,draft:response.content});
  } catch(error){next(error);}
});

router.post("/dropship-intelligence/observations", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req);
    if (!merchant) return fail(res, 401, "Authentication required");
    const supplierDomain = text(req.body?.supplierDomain, 160).toLowerCase();
    const productId = req.body?.supplierProductId == null ? null : integer(req.body?.supplierProductId, 1, 2147483647);
    const currency = text(req.body?.currency || "USD", 3).toUpperCase();
    const sourceUrl = text(req.body?.sourceUrl, 2000);
    const destinationCountry = text(req.body?.destinationCountry, 80).toUpperCase();
    const cost = moneyMinor(req.body?.observedCost);
    const shipping = moneyMinor(req.body?.shippingCost);
    const etaMin = req.body?.etaMinDays == null ? null : integer(req.body?.etaMinDays, 0, 365);
    const etaMax = req.body?.etaMaxDays == null ? null : integer(req.body?.etaMaxDays, 0, 365);
    const quality = req.body?.qualityScore == null ? null : score(req.body?.qualityScore);
    const tracking = req.body?.trackingScore == null ? null : score(req.body?.trackingScore);
    const defect = req.body?.defectRateBps == null ? null : integer(req.body?.defectRateBps, 0, 10000);
    const refund = req.body?.refundRateBps == null ? null : integer(req.body?.refundRateBps, 0, 10000);
    if (!supplierDomain || !/^[a-z0-9.-]+$/.test(supplierDomain) || !/^[A-Z]{3}$/.test(currency)) return fail(res, 400, "Supplier domain and ISO currency are required");
    if (etaMin !== null && etaMax !== null && etaMin > etaMax) return fail(res, 400, "Minimum delivery days cannot exceed maximum delivery days");
    if (productId !== null) {
      const product = await db.execute(sql`SELECT id FROM supplier_products WHERE id=${productId} AND merchant_id=${merchant.id} LIMIT 1`);
      if (!product.rows.length) return fail(res, 404, "Supplier product does not belong to this merchant");
    }
    const row = (await db.execute(sql`
      INSERT INTO dropship_supplier_observations
        (merchant_id,supplier_product_id,supplier_domain,supplier_name,source_url,destination_country,
         observed_cost_minor,shipping_cost_minor,currency,eta_min_days,eta_max_days,
         quality_score,tracking_score,defect_rate_bps,refund_rate_bps,notes,share_with_supplier_network,created_by)
      VALUES
        (${merchant.id},${productId},${supplierDomain},${text(req.body?.supplierName,160) || null},${sourceUrl || null},${destinationCountry || null},
         ${cost},${shipping},${currency},${etaMin},${etaMax},
         ${quality},${tracking},${defect},${refund},${text(req.body?.notes,2000) || null},${req.body?.shareWithSupplierNetwork === true},${merchant.userId})
      RETURNING *
    `)).rows[0];
    res.status(201).json({ observation: row });
  } catch (error) { next(error); }
});

router.post("/dropship-intelligence/products/:id/assess", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req);
    if (!merchant) return fail(res, 401, "Authentication required");
    const productId = integer(req.params.id, 1, 2147483647);
    if (productId === null) return fail(res, 400, "Invalid product id");
    const product = (await db.execute(sql`
      SELECT p.id,p.title,p.price,p.selling_price,p.currency,p.availability,p.availability_quantity,p.inventory_status,
             o.observed_cost_minor,o.shipping_cost_minor,o.quality_score,o.tracking_score,o.eta_max_days,o.refund_rate_bps
      FROM supplier_products p
      LEFT JOIN LATERAL (
        SELECT observed_cost_minor,shipping_cost_minor,quality_score,tracking_score,eta_max_days,refund_rate_bps
        FROM dropship_supplier_observations WHERE merchant_id=${merchant.id} AND supplier_product_id=p.id
        ORDER BY observed_at DESC LIMIT 1
      ) o ON true
      WHERE p.id=${productId} AND p.merchant_id=${merchant.id} LIMIT 1
    `)).rows[0] as Record<string, unknown> | undefined;
    if (!product) return fail(res, 404, "Product not found");
    const adSpendMinor = moneyMinor(req.body?.adSpendPerOrder);
    const shippingMinor = product.shipping_cost_minor == null ? moneyMinor(req.body?.shippingCost) : Number(product.shipping_cost_minor);
    const supplierMinor = product.observed_cost_minor == null
      ? product.price == null ? moneyMinor(req.body?.supplierCost) : Number(product.price) * 100
      : Number(product.observed_cost_minor);
    const result = productEconomics({
      sellingPriceMinor: Number(product.selling_price ?? 0) * 100,
      supplierCostMinor: supplierMinor,
      shippingCostMinor: shippingMinor,
      adSpendPerOrderMinor: adSpendMinor,
      targetMarginBps: integer(req.body?.targetMarginBps, 0, 9000) ?? 2000,
      supplierQualityScore: product.quality_score == null ? null : Number(product.quality_score),
      supplierTrackingScore: product.tracking_score == null ? null : Number(product.tracking_score),
      etaMaxDays: product.eta_max_days == null ? null : Number(product.eta_max_days),
      stockQuantity: product.availability_quantity == null ? null : Number(product.availability_quantity),
      stockStatus: String(product.availability ?? product.inventory_status ?? ""),
      refundRateBps: product.refund_rate_bps == null ? null : Number(product.refund_rate_bps),
    });
    const status = result.decision === "PAUSE" ? "paused" : result.decision === "FIX" ? "watch" : "live";
    await db.execute(sql`
      INSERT INTO dropship_product_guardrails
        (merchant_id,supplier_product_id,ad_spend_per_order_minor,target_margin_bps,status,decision,
         viability_score,break_even_cpa_minor,break_even_roas_x100,reasons,updated_by)
      VALUES
        (${merchant.id},${productId},${adSpendMinor},${integer(req.body?.targetMarginBps,0,9000) ?? 2000},${status},${result.decision},
         ${result.viabilityScore},${result.breakEvenCpaMinor},${result.breakEvenRoasX100},${JSON.stringify(result.reasons)}::jsonb,${merchant.userId})
      ON CONFLICT (merchant_id,supplier_product_id) DO UPDATE SET
        ad_spend_per_order_minor=EXCLUDED.ad_spend_per_order_minor,target_margin_bps=EXCLUDED.target_margin_bps,
        status=EXCLUDED.status,decision=EXCLUDED.decision,viability_score=EXCLUDED.viability_score,
        break_even_cpa_minor=EXCLUDED.break_even_cpa_minor,break_even_roas_x100=EXCLUDED.break_even_roas_x100,
        reasons=EXCLUDED.reasons,updated_by=EXCLUDED.updated_by,updated_at=now()
    `);
    res.json({ productId, productTitle: product.title, economics: result, guardrailStatus: status });
  } catch (error) { next(error); }
});

router.post("/dropship-intelligence/tracking", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req);
    if (!merchant) return fail(res, 401, "Authentication required");
    const orderId = integer(req.body?.orderId, 1, 2147483647);
    if (orderId === null) return fail(res, 400, "Valid order id is required");
    const order = await db.execute(sql`SELECT id FROM orders WHERE id=${orderId} AND merchant_id=${merchant.id} LIMIT 1`);
    if (!order.rows.length) return fail(res, 404, "Order does not belong to this merchant");
    const status = text(req.body?.status || "unknown", 30);
    if (!["unknown","label_created","shipped","in_transit","delivered","exception","returned"].includes(status)) return fail(res, 400, "Invalid tracking status");
    const lastRecordedAt = optionalDate(req.body?.lastRecordedAt) ?? new Date();
    const expected = optionalDate(req.body?.expectedDeliveryAt);
    const delivered = status === "delivered" ? (optionalDate(req.body?.deliveredAt) ?? new Date()) : optionalDate(req.body?.deliveredAt);
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO dropship_tracking_checkpoints
          (merchant_id,order_id,carrier,tracking_number,status,first_scan_at,last_recorded_at,expected_delivery_at,delivered_at,last_recorded_event,note,created_by)
        VALUES
          (${merchant.id},${orderId},${text(req.body?.carrier,120) || null},${text(req.body?.trackingNumber,240) || null},
           ${status},${status === "shipped" || status === "in_transit" ? lastRecordedAt : null},${lastRecordedAt},${expected},${delivered},
           ${text(req.body?.event,240) || null},${text(req.body?.note,2000) || null},${merchant.userId})
        ON CONFLICT (merchant_id,order_id) DO UPDATE SET
          carrier=EXCLUDED.carrier,tracking_number=EXCLUDED.tracking_number,status=EXCLUDED.status,
          first_scan_at=COALESCE(dropship_tracking_checkpoints.first_scan_at,EXCLUDED.first_scan_at),
          last_recorded_at=EXCLUDED.last_recorded_at,expected_delivery_at=EXCLUDED.expected_delivery_at,
          delivered_at=EXCLUDED.delivered_at,last_recorded_event=EXCLUDED.last_recorded_event,
          note=EXCLUDED.note,updated_at=now()
      `);
      await tx.execute(sql`
        UPDATE fulfillment_jobs
        SET carrier=${text(req.body?.carrier,120) || null},
            tracking_number=${text(req.body?.trackingNumber,240) || null},
            shipped_at=CASE WHEN ${status} IN ('shipped','in_transit') AND shipped_at IS NULL THEN ${lastRecordedAt} ELSE shipped_at END,
            delivered_at=CASE WHEN ${status}='delivered' THEN ${delivered ?? lastRecordedAt} ELSE delivered_at END,
            status=CASE WHEN ${status}='delivered' THEN 'delivered' WHEN ${status}='in_transit' THEN 'in_transit' WHEN ${status}='shipped' THEN 'shipped' ELSE status END,
            updated_at=now()
        WHERE merchant_id=${merchant.id} AND order_id=${orderId}
      `);
    });
    res.status(201).json({ orderId, status, lastRecordedAt, gap: trackingGap({ status, lastRecordedAt }) });
  } catch (error) { next(error); }
});

router.post("/dropship-intelligence/scan", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req);
    if (!merchant) return fail(res, 401, "Authentication required");
    const rows = (await db.execute(sql`
      SELECT fj.order_id,o.order_number,fj.status,fj.carrier,fj.tracking_number,
             fj.updated_at,COALESCE(t.last_recorded_at,fj.updated_at) AS last_recorded_at,
             t.expected_delivery_at
      FROM fulfillment_jobs fj
      JOIN orders o ON o.id=fj.order_id AND o.merchant_id=fj.merchant_id
      LEFT JOIN dropship_tracking_checkpoints t ON t.merchant_id=fj.merchant_id AND t.order_id=fj.order_id
      WHERE fj.merchant_id=${merchant.id} AND fj.status IN ('shipped','in_transit','accepted','processing')
      LIMIT 250
    `)).rows as Array<Record<string, unknown>>;
    const created = [];
    for (const row of rows) {
      const gap = trackingGap({ status: String(row.status), lastRecordedAt: row.last_recorded_at as string | Date });
      if (!["warning","critical"].includes(gap.state)) continue;
      const severity = gap.state === "critical" ? "critical" : "high";
      const fingerprint = `tracking-gap:${row.order_id}:${gap.state}`;
      await db.execute(sql`
        INSERT INTO dropship_alerts
          (merchant_id,kind,severity,entity_type,entity_id,title,message,fingerprint,evidence)
        VALUES
          (${merchant.id},'tracking_gap',${severity},'order',${String(row.order_id)},
           ${gap.state === "critical" ? "Critical tracking silence" : "Tracking silence"},
           ${gap.message},${fingerprint},${JSON.stringify({orderNumber:row.order_number,gapHours:gap.gapHours,lastRecordedAt:row.last_recorded_at,expectedDeliveryAt:row.expected_delivery_at})}::jsonb)
        ON CONFLICT (merchant_id,fingerprint) DO UPDATE SET
          severity=EXCLUDED.severity,message=EXCLUDED.message,evidence=EXCLUDED.evidence,status='open',updated_at=now()
      `);
      created.push({ orderId:Number(row.order_id), orderNumber:String(row.order_number), state:gap.state, gapHours:gap.gapHours });
    }
    res.json({ scanned: rows.length, alerts: created });
  } catch (error) { next(error); }
});

router.post("/dropship-intelligence/alerts/:id/resolve", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req);
    if (!merchant) return fail(res, 401, "Authentication required");
    const id = text(req.params.id, 80);
    if (!id) return fail(res, 400, "Alert id is required");
    const result = await db.execute(sql`UPDATE dropship_alerts SET status='resolved',updated_at=now() WHERE id=${id} AND merchant_id=${merchant.id} RETURNING id,status`);
    if (!result.rows.length) return fail(res, 404, "Alert not found");
    res.json({ alert: result.rows[0] });
  } catch (error) { next(error); }
});

export default router;
