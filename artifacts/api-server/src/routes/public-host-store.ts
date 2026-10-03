import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  merchantStorefrontDomainsTable,
  merchantStorefrontsTable,
  merchantsTable,
  storefrontPublicationSnapshotsTable,
  supplierProductsTable,
} from "@workspace/db";

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

router.get("/public/store/by-host", async (req, res, next): Promise<void> => {
  try {
    const host = normalizeHost(req.hostname || "");
    if (!host || host === "localhost" || host === "127.0.0.1") {
      res.status(404).json({ error: "No public storefront is mapped to this host" });
      return;
    }

    const domain = (
      await db
        .select({
          storefrontId: merchantStorefrontDomainsTable.storefrontId,
          merchantId: merchantStorefrontDomainsTable.merchantId,
        })
        .from(merchantStorefrontDomainsTable)
        .where(
          and(
            eq(merchantStorefrontDomainsTable.hostname, host),
            eq(merchantStorefrontDomainsTable.status, "verified"),
          ),
        )
        .limit(1)
    )[0];

    if (!domain || !domain.storefrontId) {
      res.status(404).json({ error: "No public storefront is mapped to this host" });
      return;
    }

    const resolved = (
      await db
        .select({ storefront: merchantStorefrontsTable, merchant: merchantsTable })
        .from(merchantStorefrontsTable)
        .innerJoin(merchantsTable, eq(merchantStorefrontsTable.merchantId, merchantsTable.id))
        .where(
          and(
            eq(merchantStorefrontsTable.id, domain.storefrontId),
            eq(merchantStorefrontsTable.merchantId, domain.merchantId),
            eq(merchantStorefrontsTable.published, true),
            eq(merchantsTable.status, "active"),
          ),
        )
        .limit(1)
    )[0];

    if (!resolved) {
      res.status(404).json({ error: "Storefront not published" });
      return;
    }

    const publication = (
      await db
        .select({
          version: storefrontPublicationSnapshotsTable.version,
          theme: storefrontPublicationSnapshotsTable.theme,
          sections: storefrontPublicationSnapshotsTable.sections,
          contentHash: storefrontPublicationSnapshotsTable.contentHash,
          publishedAt: storefrontPublicationSnapshotsTable.publishedAt,
        })
        .from(storefrontPublicationSnapshotsTable)
        .where(
          and(
            eq(storefrontPublicationSnapshotsTable.storefrontId, resolved.storefront.id),
            eq(storefrontPublicationSnapshotsTable.merchantId, resolved.merchant.id),
          ),
        )
        .orderBy(desc(storefrontPublicationSnapshotsTable.version))
        .limit(1)
    )[0];

    if (!publication) {
      res.status(404).json({ error: "Published storefront version not found" });
      return;
    }

    const products = await db
      .select()
      .from(supplierProductsTable)
      .where(
        and(
          eq(supplierProductsTable.merchantId, resolved.merchant.id),
          eq(supplierProductsTable.status, "active"),
          eq(supplierProductsTable.visibility, "active"),
          sql`${supplierProductsTable.sellingPrice} is not null`,
        ),
      )
      .orderBy(desc(supplierProductsTable.importedAt))
      .limit(100);

    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.json({
      merchantKey: resolved.storefront.publicKey,
      storeName: resolved.storefront.name,
      storeDescription: resolved.storefront.description ?? resolved.merchant.storeDescription,
      storeContactEmail: resolved.merchant.storeContactEmail,
      storePhone: resolved.merchant.storePhone,
      storeWebsite: resolved.merchant.storeWebsite,
      storeAddress: resolved.merchant.storeAddress,
      storefrontTheme: publication.theme,
      storefrontSections: publication.sections,
      publication: {
        version: publication.version,
        contentHash: publication.contentHash,
        publishedAt: publication.publishedAt,
      },
      products: products.map((product) => ({
        id: product.id,
        title: product.title,
        description: product.description,
        category: product.category,
        price: product.sellingPrice,
        salePrice: null,
        currency: product.currency,
        imageUrl: product.imageUrl,
        sku: product.sku,
        availability: product.availability,
        inventoryStatus: product.inventoryStatus,
        inventoryQuantity: product.availabilityQuantity,
        variants: Array.isArray(product.variants) ? product.variants : [],
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
