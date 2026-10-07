import { Router, type Request, type Response } from "express";
import { and, eq, or } from "drizzle-orm";
import { db, merchantsTable } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { requirePermission } from "../lib/tenant-access";
import { buildMerchantIntelligenceSnapshot, runMerchantBrain, type MerchantBrainFocus } from "../lib/commerce-intelligence";

const router = Router();
const FOCUSES = new Set<MerchantBrainFocus>([
  "all",
  "sourcing",
  "pricing",
  "conversion",
  "fulfillment",
  "marketing",
  "store-health",
  "customer-retention",
]);

async function merchantFor(req: Request, res: Response) {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const [merchant] = await db.select({ id: merchantsTable.id })
    .from(merchantsTable)
    .where(and(
      eq(merchantsTable.status, "active"),
      or(eq(merchantsTable.localAuthUserId, userId), eq(merchantsTable.clerkUserId, userId)),
    ))
    .limit(1);
  if (!merchant) {
    res.status(404).json({ error: "Merchant workspace not found" });
    return null;
  }
  try {
    await requirePermission(userId, merchant.id, "team.manage");
  } catch {
    res.status(403).json({ error: "Permission required" });
    return null;
  }
  return merchant;
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

router.get("/merchant/ai/brain/snapshot", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, res);
    if (!merchant) return;
    res.setHeader("Cache-Control", "no-store");
    const snapshot = await buildMerchantIntelligenceSnapshot(merchant.id);
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

router.post("/merchant/ai/brain/run", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, res);
    if (!merchant) return;

    const focusRaw = text(req.body?.focus, 40) ?? "all";
    if (!FOCUSES.has(focusRaw as MerchantBrainFocus)) {
      res.status(400).json({ error: "Unsupported intelligence focus" });
      return;
    }

    const productIdRaw = req.body?.productId;
    const productId = productIdRaw === undefined || productIdRaw === null || productIdRaw === ""
      ? null
      : Number(productIdRaw);
    if (productId !== null && (!Number.isInteger(productId) || productId <= 0)) {
      res.status(400).json({ error: "Invalid productId" });
      return;
    }

    const result = await runMerchantBrain({
      merchantId: merchant.id,
      goal: text(req.body?.goal, 500),
      question: text(req.body?.question, 2_000),
      focus: focusRaw as MerchantBrainFocus,
      productId,
    });

    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
