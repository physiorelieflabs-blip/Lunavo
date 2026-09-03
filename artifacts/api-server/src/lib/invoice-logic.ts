/** Decimal-safe invoice primitives; all returned monetary values are minor units. */
export function canonicalInvoiceLine(quantity: number, unitPrice: number) {
  const quantityMilli = Math.round(quantity * 1000);
  const unitPriceMinor = Math.round(unitPrice * 100);
  if (!Number.isSafeInteger(quantityMilli) || !Number.isSafeInteger(unitPriceMinor) || quantityMilli <= 0 || unitPriceMinor < 0 || Math.abs(quantity * 1000 - quantityMilli) > 1e-8 || Math.abs(unitPrice * 100 - unitPriceMinor) > 1e-8) throw new Error("Quantity supports up to 3 decimal places and unit price supports up to 2 decimal places");
  const lineTotalMinor = Math.floor((quantityMilli * unitPriceMinor + 500) / 1000);
  if (!Number.isSafeInteger(lineTotalMinor)) throw new Error("Line amount is too large");
  return { quantityMilli, unitPriceMinor, lineTotalMinor };
}
export function canonicalMoneyMinor(value: number, label: string): number {
  const minor = Math.round(value * 100);
  if (!Number.isSafeInteger(minor) || minor < 0 || Math.abs(value * 100 - minor) > 1e-8) throw new Error(`${label} supports up to 2 decimal places`);
  return minor;
}
export function invoiceStatusForDueDate(status: string, dueDate: string | null, now = new Date()): string {
  return ["sent", "viewed", "partially_paid"].includes(status) && dueDate && dueDate < now.toISOString().slice(0, 10) ? "overdue" : status;
}