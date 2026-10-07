import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { toMinorUnits } from "./money";

export type SupplierAlternative = {
  id: string;
  merchant_id: number;
  primary_product_id: number;
  alternative_product_id: number;
  priority: number;
  enabled: boolean;
  auto_fallback: boolean;
  same_currency_required: boolean;
  min_margin_bps: number;
  notes: string | null;
  alternative_title?: string;
  alternative_currency?: string;
  alternative_price?: string | null;
  alternative_sale_price?: string | null;
  alternative_availability?: string | null;
  alternative_availability_quantity?: number | null;
  alternative_status?: string;
};

function marginBps(sellingMinor: number, costMinor: number): number {
  if (!Number.isSafeInteger(sellingMinor) || sellingMinor <= 0 || !Number.isSafeInteger(costMinor)) return -100_000;
  return Number((BigInt(sellingMinor - costMinor) * 10_000n) / BigInt(sellingMinor));
}

async function assertProductOwnership(merchantId: number, productId: number): Promise<boolean> {
  if (!Number.isInteger(productId) || productId <= 0) return false;
  const result = await db.execute(sql`
    SELECT id
    FROM supplier_products
    WHERE id=${productId} AND merchant_id=${merchantId}
    LIMIT 1
  `);
  return result.rows.length > 0;
}

export async function listSupplierAlternatives(merchantId: number, primaryProductId: number): Promise<SupplierAlternative[]> {
  if (!(await assertProductOwnership(merchantId, primaryProductId))) throw new Error("Primary supplier product is not in this merchant workspace");
  const result = await db.execute(sql`
    SELECT a.*, sp.title AS alternative_title, sp.currency AS alternative_currency,
           sp.price AS alternative_price, sp.sale_price AS alternative_sale_price,
           sp.availability AS alternative_availability,
           sp.availability_quantity AS alternative_availability_quantity,
           sp.status AS alternative_status
    FROM supplier_product_alternatives a
    JOIN supplier_products sp
      ON sp.id=a.alternative_product_id AND sp.merchant_id=a.merchant_id
    WHERE a.merchant_id=${merchantId}
      AND a.primary_product_id=${primaryProductId}
    ORDER BY a.priority ASC, a.created_at ASC
  `);
  return result.rows as SupplierAlternative[];
}

export async function upsertSupplierAlternative(input: {
  merchantId: number;
  primaryProductId: number;
  alternativeProductId: number;
  priority?: number;
  enabled?: boolean;
  autoFallback?: boolean;
  sameCurrencyRequired?: boolean;
  minMarginBps?: number;
  notes?: string | null;
}) {
  const { merchantId, primaryProductId, alternativeProductId } = input;
  if (!Number.isInteger(merchantId) || merchantId <= 0) throw new Error("Invalid merchant id");
  if (!Number.isInteger(primaryProductId) || primaryProductId <= 0 || !Number.isInteger(alternativeProductId) || alternativeProductId <= 0) {
    throw new Error("Invalid supplier product");
  }
  if (primaryProductId === alternativeProductId) throw new Error("A product cannot be its own fallback supplier");
  const owned = await Promise.all([
    assertProductOwnership(merchantId, primaryProductId),
    assertProductOwnership(merchantId, alternativeProductId),
  ]);
  if (!owned[0] || !owned[1]) throw new Error("Supplier alternatives must belong to the same merchant workspace");

  const priority = Math.max(1, Math.min(100_000, Math.trunc(input.priority ?? 100)));
  const minMarginBps = Math.max(0, Math.min(100_000, Math.trunc(input.minMarginBps ?? 1500)));
  const notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 1_000) || null : null;

  const result = await db.execute(sql`
    INSERT INTO supplier_product_alternatives (
      merchant_id, primary_product_id, alternative_product_id, priority,
      enabled, auto_fallback, same_currency_required, min_margin_bps, notes
    )
    VALUES (
      ${merchantId}, ${primaryProductId}, ${alternativeProductId}, ${priority},
      ${input.enabled !== false}, ${input.autoFallback === true},
      ${input.sameCurrencyRequired !== false}, ${minMarginBps}, ${notes}
    )
    ON CONFLICT (merchant_id, primary_product_id, alternative_product_id)
    DO UPDATE SET
      priority=EXCLUDED.priority,
      enabled=EXCLUDED.enabled,
      auto_fallback=EXCLUDED.auto_fallback,
      same_currency_required=EXCLUDED.same_currency_required,
      min_margin_bps=EXCLUDED.min_margin_bps,
      notes=EXCLUDED.notes,
      updated_at=now()
    RETURNING *
  `);
  return result.rows[0] as SupplierAlternative;
}

export async function removeSupplierAlternative(merchantId: number, alternativeId: string): Promise<boolean> {
  const result = await db.execute(sql`
    DELETE FROM supplier_product_alternatives
    WHERE id=${alternativeId}::uuid AND merchant_id=${merchantId}
    RETURNING id
  `);
  return result.rows.length > 0;
}

export async function resolveAutoFallbackSupplierProduct(
  executor: { execute: (query: unknown) => Promise<any> },
  input: {
    merchantId: number;
    primaryProductId: number;
    sellingPriceMinor: number | null;
    sellingCurrency: string;
  },
) {
  if (input.sellingPriceMinor === null || input.sellingPriceMinor <= 0) return null;
  const result = await executor.execute(sql`
    SELECT a.id AS mapping_id, a.same_currency_required, a.min_margin_bps,
           sp.id, sp.title, sp.supplier_url, sp.source_url, sp.currency,
           sp.price, sp.sale_price, sp.selling_price, sp.availability,
           sp.availability_quantity, sp.status, sp.visibility, sp.supplier_id
    FROM supplier_product_alternatives a
    JOIN supplier_products sp
      ON sp.id=a.alternative_product_id AND sp.merchant_id=a.merchant_id
    WHERE a.merchant_id=${input.merchantId}
      AND a.primary_product_id=${input.primaryProductId}
      AND a.enabled=true
      AND a.auto_fallback=true
      AND sp.status NOT IN ('paused','draft','archived')
      AND sp.visibility NOT IN ('hidden','draft')
      AND sp.availability='in_stock'
      AND (sp.availability_quantity IS NULL OR sp.availability_quantity > 0)
    ORDER BY a.priority ASC, a.created_at ASC
    LIMIT 25
  `);

  for (const row of result.rows as Array<Record<string, unknown>>) {
    const currency = String(row.currency ?? "").toUpperCase();
    if (input.sellingCurrency && currency && input.sellingCurrency.toUpperCase() !== currency) continue;
    const costMinor = toMinorUnits(row.sale_price ?? row.price);
    if (costMinor === null) continue;
    const margin = marginBps(input.sellingPriceMinor, costMinor);
    const minimum = Number(row.min_margin_bps ?? 1500);
    if (margin < minimum) continue;
    return {
      mappingId: String(row.mapping_id),
      supplierProductId: Number(row.id),
      title: String(row.title ?? ""),
      supplierUrl: typeof row.supplier_url === "string" ? row.supplier_url : null,
      sourceUrl: typeof row.source_url === "string" ? row.source_url : null,
      currency,
      costMinor,
      marginBps: margin,
      supplierId: row.supplier_id == null ? null : Number(row.supplier_id),
    };
  }
  return null;
}
