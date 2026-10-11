export type SupplierSyncStock = {
  inventoryStrategy: string;
  inventoryStatus: string | null;
  availabilityQuantity: number | null;
  importStatus: string | null;
  sourceMetadata?: unknown;
};
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function normalizeSupplierStock(availability: string | null | undefined, rawQuantity: number | null | undefined): {
  inventoryStatus: "available" | "out_of_stock" | "unknown";
  availabilityQuantity: number | null;
} {
  const quantity = Number.isSafeInteger(rawQuantity) && Number(rawQuantity) >= 0 ? Number(rawQuantity) : null;
  if (quantity !== null) return quantity === 0
    ? { inventoryStatus: "out_of_stock", availabilityQuantity: 0 }
    : { inventoryStatus: "available", availabilityQuantity: quantity };
  const status = String(availability ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (/(^|_)(out_of_stock|sold_out|unavailable|discontinued|not_available)(_|$)/.test(status)) {
    return { inventoryStatus: "out_of_stock", availabilityQuantity: 0 };
  }
  if (/(^|_)(in_stock|instock|available|limited_stock)(_|$)/.test(status)) {
    return { inventoryStatus: "available", availabilityQuantity: null };
  }
  return { inventoryStatus: "unknown", availabilityQuantity: null };
}
/** Synchronized SKUs need a successful, fresh observation and numeric count to sell. */
export function supplierSyncCheckoutError(input: SupplierSyncStock, now = Date.now(), freshnessMs = 45 * 60_000): string | null {
  if (input.inventoryStrategy !== "synchronized") return null;
  const sync = record(record(input.sourceMetadata).supplierSync);
  if (sync.state === "syncing") return "Supplier stock is being refreshed. Please retry shortly.";
  if (sync.state === "failed" || input.importStatus === "source_unavailable") return "Supplier availability could not be verified. This product is temporarily unavailable.";
  if (input.importStatus === "needs_review" || input.importStatus === "manual_import_required") return "Supplier product details need merchant review before checkout can continue.";
  const lastSuccessAt = typeof sync.lastSuccessAt === "string" ? Date.parse(sync.lastSuccessAt) : NaN;
  if (!Number.isFinite(lastSuccessAt) || lastSuccessAt > now + 60_000 || now - lastSuccessAt > freshnessMs) return "Supplier stock confirmation is missing or stale. This product is temporarily unavailable.";
  if (input.inventoryStatus === "out_of_stock" || input.availabilityQuantity === 0) return "The supplier currently reports this product as out of stock.";
  if (input.inventoryStatus !== "available" && input.inventoryStatus !== "in_stock") return "Supplier availability is unconfirmed. This product is temporarily unavailable.";
  if (!Number.isSafeInteger(input.availabilityQuantity) || Number(input.availabilityQuantity) < 1) return "The supplier has not provided a numeric stock quantity. Review the inventory strategy before selling.";
  return null;
}
