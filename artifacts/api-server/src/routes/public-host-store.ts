import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, merchantsTable, supplierProductsTable } from "@workspace/db";

const router = Router();

function normalizeHost(value: string): string {
  const raw = value.trim().toLowerCase();
  if (!raw) return "";
  try {
    const parsed = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  }
}

router.get("/public/store/by-host", async (req, res): Promise<void> => {
  const host = normalizeHost(req.hostname || "");
  if (!host || host === "localhost" || host === "127.0.0.1") {
    res.status(404).json({ error: "No public storefront is mapped to this host" });
    return;
  }

  const merchants = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.status, "active"));
  const merchant = merchants.find((candidate) => {
    if (!candidate.storeWebsite) return false;
    return normalizeHost(candidate.storeWebsite) === host;
  });
  if (!merchant || !merchant.publicStoreKey || !merchant.storefrontPublished) {
    res.status(404).json({ error: "No public storefront is mapped to this host" });
    return;
  }

  const products = await db
    .select()
    .from(supplierProductsTable)
    .where(eq(supplierProductsTable.merchantId, merchant.id));

  res.json({
    merchantKey: merchant.publicStoreKey,
    storeName: merchant.storeName,
    storeDescription: merchant.storeDescription,
    storeContactEmail: merchant.storeContactEmail,
    storePhone: merchant.storePhone,
    storeAddress: merchant.storeAddress,
    storefrontTheme: merchant.storefrontTheme,
    storefrontSections: merchant.storefrontSections,
    products: products
      .filter((product) => product.status === "published" && product.visibility !== "private" && product.sellingPrice !== null)
      .map((product) => ({
        id: product.id,
        title: product.title,
        description: product.description,
        category: product.category,
        price: product.sellingPrice,
        currency: product.currency,
        imageUrl: product.imageUrl,
        inventoryStatus: product.inventoryStatus,
        inventoryQuantity: product.availabilityQuantity,
      })),
  });
});

export default router;
