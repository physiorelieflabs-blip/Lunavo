import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export type SupplierScorecard = {
  supplierId: number | null;
  supplierName: string;
  products: number;
  activeProducts: number;
  inStockProducts: number;
  fulfillmentJobs: number;
  shippedJobs: number;
  deliveredJobs: number;
  failedJobs: number;
  onTimeRate: number | null;
  deliveryRate: number | null;
  failureRate: number | null;
  stockCoverageRate: number | null;
  score: number;
  recommendation: "preferred" | "watch" | "avoid";
};

function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : null;
}

export async function getSupplierScorecards(merchantId: number): Promise<SupplierScorecard[]> {
  if (!Number.isInteger(merchantId) || merchantId <= 0) throw new Error("Invalid merchant id");
  const result = await db.execute(sql`
    WITH product_stats AS (
      SELECT
        sp.supplier_id,
        COUNT(*)::int AS products,
        COUNT(*) FILTER (WHERE sp.status='active' AND sp.visibility='active')::int AS active_products,
        COUNT(*) FILTER (WHERE sp.availability='in_stock' AND (sp.availability_quantity IS NULL OR sp.availability_quantity > 0))::int AS in_stock_products
      FROM supplier_products sp
      WHERE sp.merchant_id=${merchantId}
      GROUP BY sp.supplier_id
    ),
    fulfillment_stats AS (
      SELECT
        sp.supplier_id,
        COUNT(fj.id)::int AS fulfillment_jobs,
        COUNT(fj.id) FILTER (WHERE fj.status IN ('shipped','delivered','completed'))::int AS shipped_jobs,
        COUNT(fj.id) FILTER (WHERE fj.status IN ('delivered','completed'))::int AS delivered_jobs,
        COUNT(fj.id) FILTER (WHERE fj.status IN ('failed','cancelled'))::int AS failed_jobs,
        COUNT(fj.id) FILTER (WHERE fj.status IN ('shipped','delivered','completed') AND fj.shipped_at IS NOT NULL AND fj.created_at IS NOT NULL AND fj.shipped_at <= fj.created_at + interval '7 days')::int AS on_time_jobs
      FROM fulfillment_jobs fj
      JOIN supplier_products sp ON sp.id=fj.supplier_product_id AND sp.merchant_id=fj.merchant_id
      WHERE fj.merchant_id=${merchantId}
      GROUP BY sp.supplier_id
    )
    SELECT
      COALESCE(ps.supplier_id, fs.supplier_id) AS supplier_id,
      COALESCE(s.name, 'Unmapped supplier') AS supplier_name,
      COALESCE(ps.products,0)::int AS products,
      COALESCE(ps.active_products,0)::int AS active_products,
      COALESCE(ps.in_stock_products,0)::int AS in_stock_products,
      COALESCE(fs.fulfillment_jobs,0)::int AS fulfillment_jobs,
      COALESCE(fs.shipped_jobs,0)::int AS shipped_jobs,
      COALESCE(fs.delivered_jobs,0)::int AS delivered_jobs,
      COALESCE(fs.failed_jobs,0)::int AS failed_jobs,
      COALESCE(fs.on_time_jobs,0)::int AS on_time_jobs
    FROM product_stats ps
    FULL OUTER JOIN fulfillment_stats fs ON fs.supplier_id IS NOT DISTINCT FROM ps.supplier_id
    LEFT JOIN suppliers s ON s.id=COALESCE(ps.supplier_id, fs.supplier_id) AND s.merchant_id=${merchantId}
    ORDER BY COALESCE(ps.in_stock_products,0) DESC, COALESCE(fs.failed_jobs,0) ASC, COALESCE(ps.products,0) DESC
  `);

  return (result.rows as Array<Record<string, unknown>>).map((row) => {
    const products = Number(row.products) || 0;
    const inStockProducts = Number(row.in_stock_products) || 0;
    const jobs = Number(row.fulfillment_jobs) || 0;
    const shipped = Number(row.shipped_jobs) || 0;
    const delivered = Number(row.delivered_jobs) || 0;
    const failed = Number(row.failed_jobs) || 0;
    const onTime = Number(row.on_time_jobs) || 0;
    const stockCoverageRate = pct(inStockProducts, products);
    const deliveryRate = pct(delivered, shipped);
    const failureRate = pct(failed, jobs);
    const onTimeRate = pct(onTime, shipped);
    const stockScore = stockCoverageRate === null ? 50 : stockCoverageRate;
    const deliveryScore = deliveryRate === null ? 70 : deliveryRate;
    const reliabilityScore = failureRate === null ? 80 : Math.max(0, 100 - failureRate);
    const timelinessScore = onTimeRate === null ? 70 : onTimeRate;
    const score = Math.round(stockScore * 0.30 + deliveryScore * 0.30 + reliabilityScore * 0.25 + timelinessScore * 0.15);
    return {
      supplierId: row.supplier_id == null ? null : Number(row.supplier_id),
      supplierName: String(row.supplier_name ?? "Unmapped supplier"),
      products,
      activeProducts: Number(row.active_products) || 0,
      inStockProducts,
      fulfillmentJobs: jobs,
      shippedJobs: shipped,
      deliveredJobs: delivered,
      failedJobs: failed,
      onTimeRate,
      deliveryRate,
      failureRate,
      stockCoverageRate,
      score,
      recommendation: score >= 80 ? "preferred" : score >= 60 ? "watch" : "avoid",
    } satisfies SupplierScorecard;
  });
}