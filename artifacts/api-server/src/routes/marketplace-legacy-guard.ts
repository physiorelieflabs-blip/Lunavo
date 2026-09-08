import { Router } from "express";
import { and, desc, eq, exists, gte, ilike, or, sql } from "drizzle-orm";
import { db, merchantsTable, marketplaceListingsTable, marketplaceBillingRecordsTable, supplierProductsTable } from "@workspace/db";

const router = Router();
const DAYS = 30;

// Legacy client compatibility. The old marketplace endpoint now applies the
// same shopper eligibility checks as the new authoritative discovery feed.
router.get("/marketplace/products", async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 120) : "";
  const category = typeof req.query.category === "string" ? req.query.category.trim().slice(0, 120) : "";
  const currency = typeof req.query.currency === "string" ? req.query.currency.trim().toUpperCase() : "";
  const cutoff = new Date(Date.now() - DAYS * 86_400_000);
  const filters = [
    eq(merchantsTable.status, "active"),
    sql`${merchantsTable.publicStoreKey} is not null`,
    eq(supplierProductsTable.status, "active"),
    eq(supplierProductsTable.visibility, "active"),
    eq(marketplaceListingsTable.status, "approved"),
    eq(marketplaceListingsTable.listingFeeStatus, "paid"),
    exists(db.select({ id: marketplaceBillingRecordsTable.id }).from(marketplaceBillingRecordsTable).where(and(
      eq(marketplaceBillingRecordsTable.merchantId, merchantsTable.id),
      eq(marketplaceBillingRecordsTable.kind, "monthly"),
      eq(marketplaceBillingRecordsTable.status, "paid"),
      gte(marketplaceBillingRecordsTable.paidAt, cutoff),
    ))),
    exists(db.select({ id: marketplaceBillingRecordsTable.id }).from(marketplaceBillingRecordsTable).where(and(
      eq(marketplaceBillingRecordsTable.merchantId, merchantsTable.id),
      eq(marketplaceBillingRecordsTable.listingId, marketplaceListingsTable.id),
      eq(marketplaceBillingRecordsTable.kind, "listing"),
      eq(marketplaceBillingRecordsTable.status, "paid"),
      gte(marketplaceBillingRecordsTable.paidAt, cutoff),
    ))),
    sql`${supplierProductsTable.sellingPrice} is not null`,
  ];
  if (search) filters.push(or(ilike(supplierProductsTable.title, `%${search}%`), ilike(supplierProductsTable.description, `%${search}%`))!);
  if (category) filters.push(eq(supplierProductsTable.category, category));
  if (currency) filters.push(eq(supplierProductsTable.currency, currency));
  const rows = await db.select({ product: supplierProductsTable, merchantKey: merchantsTable.publicStoreKey, merchantName: merchantsTable.storeName })
    .from(marketplaceListingsTable)
    .innerJoin(supplierProductsTable, eq(marketplaceListingsTable.supplierProductId, supplierProductsTable.id))
    .innerJoin(merchantsTable, eq(marketplaceListingsTable.merchantId, merchantsTable.id))
    .where(and(...filters))
    .orderBy(desc(supplierProductsTable.publishedAt), desc(supplierProductsTable.importedAt))
    .limit(100);
  res.json(rows.map(({ product, merchantKey, merchantName }) => ({
    id: product.id, merchantKey, merchantName: merchantName || "Independent merchant", title: product.title,
    description: product.description, imageUrl: product.imageUrl, price: Number(product.sellingPrice), salePrice: null,
    currency: product.currency, category: product.category, brand: product.brand,
    availability: product.availability, availabilityQuantity: product.availabilityQuantity,
  })));
});

export default router;
