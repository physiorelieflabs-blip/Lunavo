import { Router, type Request, type Response } from "express";
import { and, eq, or, sql } from "drizzle-orm";
import { db, merchantsTable } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { requirePermission } from "../lib/tenant-access";
import { listSupplierAlternatives, removeSupplierAlternative, upsertSupplierAlternative } from "../lib/supplier-routing";

const router = Router();

async function merchantFor(req: Request, res: Response) {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  const [merchant] = await db.select({ id: merchantsTable.id })
    .from(merchantsTable)
    .where(and(eq(merchantsTable.status, "active"), or(eq(merchantsTable.localAuthUserId, userId), eq(merchantsTable.clerkUserId, userId))))
    .limit(1);
  if (!merchant) { res.status(404).json({ error: "Merchant workspace not found" }); return null; }
  try { await requirePermission(userId, merchant.id, "fulfillment.manage"); }
  catch { res.status(403).json({ error: "Permission required" }); return null; }
  return { merchantId: merchant.id };
}

function productId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

router.get("/merchant/dropshipping/routing/:productId", async (req: Request, res: Response, next) => {
  try {
    const ctx = await merchantFor(req, res); if (!ctx) return;
    const id = productId(req.params.productId);
    if (!id) { res.status(400).json({ error: "Invalid product id" }); return; }
    const alternatives = await listSupplierAlternatives(ctx.merchantId, id);
    res.json({ primaryProductId: id, alternatives });
  } catch (error) { next(error); }
});

router.put("/merchant/dropshipping/routing/:productId", async (req: Request, res: Response, next) => {
  try {
    const ctx = await merchantFor(req, res); if (!ctx) return;
    const primaryProductId = productId(req.params.productId);
    const alternativeProductId = productId(req.body?.alternativeProductId);
    if (!primaryProductId || !alternativeProductId) {
      res.status(400).json({ error: "A valid primary and alternative product are required" });
      return;
    }
    const [primary, alternative] = await Promise.all([
      db.execute(sql`SELECT id FROM supplier_products WHERE id=${primaryProductId} AND merchant_id=${ctx.merchantId} LIMIT 1`),
      db.execute(sql`SELECT id FROM supplier_products WHERE id=${alternativeProductId} AND merchant_id=${ctx.merchantId} LIMIT 1`),
    ]);
    if (!primary.rows.length || !alternative.rows.length) {
      res.status(404).json({ error: "Both supplier products must belong to this merchant workspace" });
      return;
    }
    const mapping = await upsertSupplierAlternative({
      merchantId: ctx.merchantId,
      primaryProductId,
      alternativeProductId,
      priority: boundedInteger(req.body?.priority, 100, 1, 100000),
      enabled: req.body?.enabled !== false,
      autoFallback: req.body?.autoFallback === true,
      sameCurrencyRequired: req.body?.sameCurrencyRequired !== false,
      minMarginBps: boundedInteger(req.body?.minMarginBps, 1500, 0, 100000),
      minSupplierQuantity: boundedInteger(req.body?.minSupplierQuantity, 0, 0, 100000000),
      maxShippingDays: boundedInteger(req.body?.maxShippingDays, 30, 1, 365),
      destinationMode: ["global","include","exclude"].includes(req.body?.destinationMode) ? req.body.destinationMode : "global",
      destinationCountries: Array.isArray(req.body?.destinationCountries)
        ? req.body.destinationCountries.filter((value: unknown): value is string => typeof value === "string")
        : [],
      notes: typeof req.body?.notes === "string" ? req.body.notes : null,
    });
    res.json({ mapping });
  } catch (error) { next(error); }
});

router.delete("/merchant/dropshipping/routing/:mappingId", async (req: Request, res: Response, next) => {
  try {
    const ctx = await merchantFor(req, res); if (!ctx) return;
    const mappingId = String(req.params.mappingId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(mappingId)) {
      res.status(400).json({ error: "Invalid mapping id" });
      return;
    }
    const removed = await removeSupplierAlternative(ctx.merchantId, mappingId);
    if (!removed) { res.status(404).json({ error: "Supplier mapping not found" }); return; }
    res.json({ removed: true });
  } catch (error) { next(error); }
});

export default router;