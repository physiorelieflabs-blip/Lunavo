import { Router, type Request, type Response } from "express";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db, merchantsTable } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { requirePermission } from "../lib/tenant-access";
import { ensurePolicy, loadSupplierSyncPolicy, synchronizeSupplierProduct, type SyncPolicy } from "../lib/supplier-sync";

const router = Router();

async function merchantFor(req: Request, res: Response) {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  const [merchant] = await db.select({ id: merchantsTable.id })
    .from(merchantsTable)
    .where(and(
      eq(merchantsTable.status, "active"),
      or(eq(merchantsTable.localAuthUserId, userId), eq(merchantsTable.clerkUserId, userId)),
    ))
    .limit(1);
  if (!merchant) { res.status(404).json({ error: "Merchant workspace not found" }); return null; }
  try { await requirePermission(userId, merchant.id, "fulfillment.manage"); }
  catch { res.status(403).json({ error: "Permission required" }); return null; }
  return { merchantId: merchant.id, userId };
}

function productId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

router.get("/merchant/dropshipping/sync-policies", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res); if (!ctx) return;
    const rows = await db.execute(sql`
      SELECT p.*,sp.title AS product_title,sp.source_url,sp.availability,sp.availability_quantity,
             sp.price AS source_price,sp.sale_price AS source_sale_price,sp.currency AS source_currency,
             sp.selling_price,sp.visibility,sp.status
      FROM supplier_sync_policies p
      JOIN supplier_products sp ON sp.id=p.supplier_product_id AND sp.merchant_id=p.merchant_id
      WHERE p.merchant_id=${ctx.merchantId}
      ORDER BY p.updated_at DESC
      LIMIT 500
    `);
    res.json({ policies: rows.rows });
  } catch (e) { next(e); }
});

router.get("/merchant/dropshipping/sync-policies/:productId", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res); if (!ctx) return;
    const id = productId(req.params.productId);
    if (!id) { res.status(400).json({ error: "Invalid product id" }); return; }
    const policy = await loadSupplierSyncPolicy(ctx.merchantId, id);
    if (!policy) {
      const created = await ensurePolicy(ctx.merchantId, id);
      res.json({ policy: created });
      return;
    }
    res.json({ policy });
  } catch (e) { next(e); }
});

router.put("/merchant/dropshipping/sync-policies/:productId", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res); if (!ctx) return;
    const id = productId(req.params.productId);
    if (!id) { res.status(400).json({ error: "Invalid product id" }); return; }

    const product = await db.execute(sql`
      SELECT id FROM supplier_products WHERE id=${id} AND merchant_id=${ctx.merchantId} LIMIT 1
    `);
    if (!product.rows.length) { res.status(404).json({ error: "Supplier product not found" }); return; }

    const current = await ensurePolicy(ctx.merchantId, id);
    const outOfStock = ["pause", "keep_last", "draft"].includes(String(req.body?.outOfStockAction))
      ? String(req.body.outOfStockAction)
      : current.out_of_stock_action;

    const values = {
      enabled: booleanOr(req.body?.enabled, current.enabled),
      syncPrice: booleanOr(req.body?.syncPrice, current.sync_price),
      syncStock: booleanOr(req.body?.syncStock, current.sync_stock),
      syncVariants: booleanOr(req.body?.syncVariants, current.sync_variants),
      syncMedia: booleanOr(req.body?.syncMedia, current.sync_media),
      syncDescription: booleanOr(req.body?.syncDescription, current.sync_description),
      maxPriceChangeBps: boundedInteger(req.body?.maxPriceChangeBps, current.max_price_change_bps, 0, 100000),
      minMarginBps: boundedInteger(req.body?.minMarginBps, current.min_margin_bps, 0, 100000),
      outOfStockAction: outOfStock,
      requirePriceReview: booleanOr(req.body?.requirePriceReview, current.require_price_review),
      autoApply: booleanOr(req.body?.autoApply, current.auto_apply),
    };

    const saved = await db.execute(sql`
      UPDATE supplier_sync_policies
      SET enabled=${values.enabled},
          sync_price=${values.syncPrice},
          sync_stock=${values.syncStock},
          sync_variants=${values.syncVariants},
          sync_media=${values.syncMedia},
          sync_description=${values.syncDescription},
          max_price_change_bps=${values.maxPriceChangeBps},
          min_margin_bps=${values.minMarginBps},
          out_of_stock_action=${values.outOfStockAction},
          require_price_review=${values.requirePriceReview},
          auto_apply=${values.autoApply},
          updated_at=now()
      WHERE merchant_id=${ctx.merchantId} AND supplier_product_id=${id}
      RETURNING id,merchant_id,supplier_product_id,enabled,sync_price,sync_stock,sync_variants,
                sync_media,sync_description,max_price_change_bps,min_margin_bps,
                out_of_stock_action,require_price_review,auto_apply,last_run_at
    `);
    res.json({ policy: saved.rows[0] ?? null });
  } catch (e) { next(e); }
});

router.post("/merchant/dropshipping/sync/:productId", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res); if (!ctx) return;
    const id = productId(req.params.productId);
    if (!id) { res.status(400).json({ error: "Invalid product id" }); return; }
    const policy = await ensurePolicy(ctx.merchantId, id);
    const result = await synchronizeSupplierProduct({
      merchantId: ctx.merchantId,
      productId: id,
      policy,
      triggeredBy: ctx.userId,
    });
    res.status(result.status === "review_required" ? 202 : 200).json(result);
  } catch (e) {
    next(e);
  }
});

router.get("/merchant/dropshipping/sync/:productId/runs", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res); if (!ctx) return;
    const id = productId(req.params.productId);
    if (!id) { res.status(400).json({ error: "Invalid product id" }); return; }
    const runs = await db.execute(sql`
      SELECT id,status,changed_fields,before_state,after_state,error_message,triggered_by,created_at,completed_at
      FROM supplier_sync_runs
      WHERE merchant_id=${ctx.merchantId} AND supplier_product_id=${id}
      ORDER BY created_at DESC
      LIMIT 100
    `);
    res.json({ runs: runs.rows });
  } catch (e) { next(e); }
});

export default router;
