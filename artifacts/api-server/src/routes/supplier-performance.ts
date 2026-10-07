import { Router, type Request, type Response } from "express";
import { and, eq, or } from "drizzle-orm";
import { db, merchantsTable } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { requirePermission } from "../lib/tenant-access";
import { getSupplierScorecards } from "../lib/supplier-performance";

const router = Router();

router.get("/merchant/dropshipping/supplier-scorecards", async (req: Request, res: Response, next) => {
  try {
    const userId = getAuth(req).userId;
    if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
    const [merchant] = await db.select({ id: merchantsTable.id })
      .from(merchantsTable)
      .where(and(eq(merchantsTable.status, "active"), or(eq(merchantsTable.localAuthUserId, userId), eq(merchantsTable.clerkUserId, userId))))
      .limit(1);
    if (!merchant) { res.status(404).json({ error: "Merchant workspace not found" }); return; }
    await requirePermission(userId, merchant.id, "fulfillment.manage");
    res.setHeader("Cache-Control", "no-store");
    res.json({ generatedAt: new Date().toISOString(), scorecards: await getSupplierScorecards(merchant.id) });
  } catch (error) { next(error); }
});

export default router;