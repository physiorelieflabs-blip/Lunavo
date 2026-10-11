/**
 * A supplier scrape is only allowed to update the product's stored price/currency
 * when monitoring is enabled, a positive amount was actually parsed, and its
 * currency matches the currency under which the current selling price is stored.
 * Currency changes require operator review; silently reinterpreting a selling
 * price in a new currency can cause severe merchant losses.
 */
export function shouldApplySupplierPriceFields(
  syncPriceEnabled: boolean,
  currentCurrency: unknown,
  incomingCurrency: unknown,
  incomingPriceMinor: number | null,
): boolean {
  if (syncPriceEnabled !== true || !Number.isSafeInteger(incomingPriceMinor) || incomingPriceMinor === null || incomingPriceMinor <= 0) {
    return false;
  }
  const current = typeof currentCurrency === "string" ? currentCurrency.trim().toUpperCase() : "";
  const incoming = typeof incomingCurrency === "string" ? incomingCurrency.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(current) && current === incoming;
}

/**
 * A failed or unfamiliar stock extraction is not evidence that stock changed.
 * Keep the previous observation until a recognized status is present.
 */
export function shouldApplySupplierStockFields(syncStockEnabled: boolean, availability: unknown): boolean {
  if (syncStockEnabled !== true || typeof availability !== "string") return false;
  return new Set(["in_stock", "out_of_stock", "limited_stock", "preorder"]).has(availability.trim().toLowerCase());
}
