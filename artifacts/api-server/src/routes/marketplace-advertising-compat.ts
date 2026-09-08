import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, marketplaceBillingRecordsTable, marketplaceListingsTable, merchantsTable } from "@workspace/db";

const router = Router();

async function ownsBilling(req: any, billingId: number) {
  const userId = getAuth(req).userId;
  if (!userId) return null;
  const merchant = (await db.select({ id: merchantsTable.id }).from(merchantsTable).where(and(eq(merchantsTable.clerkUserId, userId), eq(merchantsTable.status, "active"))).limit(1))[0];
  if (!merchant) return null;
  return (await db.select().from(marketplaceBillingRecordsTable).where(and(eq(marketplaceBillingRecordsTable.id, billingId), eq(marketplaceBillingRecordsTable.merchantId, merchant.id))).limit(1))[0] ?? null;
}

router.post("/marketplace/listings/:id/checkout", (req, res) => {
  const listingId = Number(req.params.id);
  if (!Number.isInteger(listingId) || listingId < 1) { res.status(400).json({ error: "Invalid marketplace listing." }); return; }
  res.redirect(307, `/api/marketplace/advertising/${listingId}/checkout`);
});

router.post("/marketplace/billing/:id/checkout", async (req, res): Promise<void> => {
  const billingId = Number(req.params.id);
  if (!Number.isInteger(billingId) || billingId < 1) { res.status(400).json({ error: "Invalid marketplace billing record." }); return; }
  const billing = await ownsBilling(req, billingId);
  if (!billing?.listingId) { res.status(404).json({ error: "Marketplace advertising fee not found." }); return; }
  res.redirect(307, `/api/marketplace/advertising/${billing.listingId}/checkout`);
});

router.post("/marketplace/billing/:id/verify", async (req, res): Promise<void> => {
  const billingId = Number(req.params.id);
  if (!Number.isInteger(billingId) || billingId < 1) { res.status(400).json({ error: "Invalid marketplace billing record." }); return; }
  const billing = await ownsBilling(req, billingId);
  if (!billing?.listingId) { res.status(404).json({ error: "Marketplace advertising fee not found." }); return; }
  res.redirect(307, `/api/marketplace/advertising/${billing.listingId}/verify`);
});

export default router;
