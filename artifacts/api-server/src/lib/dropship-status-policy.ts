export type DropshipStatusInput = {
  supplierOrderReference?: unknown;
  trackingNumber?: unknown;
  currentSupplierOrderReference?: string | null;
  currentTrackingNumber?: string | null;
};
const transitions: Record<string, readonly string[]> = {
  not_submitted: ["not_submitted", "submitted", "canceled", "failed"],
  submitted: ["submitted", "accepted", "processing", "canceled", "failed"],
  accepted: ["accepted", "processing", "canceled", "failed"],
  processing: ["processing", "shipped", "canceled", "failed"],
  shipped: ["shipped", "in_transit", "delivered", "failed"],
  in_transit: ["in_transit", "delivered", "failed"],
  delivered: ["delivered"],
  canceled: ["canceled"],
  failed: ["failed", "submitted"],
};
function afterUpdate(value: unknown, current: string | null | undefined): string | null {
  if (value === undefined) return current?.trim() || null;
  if (value === null) return null;
  return typeof value === "string" ? value.trim() || null : null;
}
/** State-machine + evidence checks for the legacy order-level dropshipping workflow. */
export function dropshipStatusTransitionError(
  currentStatus: string,
  nextStatus: string,
  input: DropshipStatusInput,
): string | null {
  if (!transitions[currentStatus]?.includes(nextStatus)) {
    return `Cannot move supplier fulfillment from ${currentStatus.replaceAll("_", " ")} to ${nextStatus.replaceAll("_", " ")}`;
  }
  const nextReference = afterUpdate(input.supplierOrderReference, input.currentSupplierOrderReference);
  const nextTracking = afterUpdate(input.trackingNumber, input.currentTrackingNumber);
  if (input.supplierOrderReference !== undefined && input.supplierOrderReference !== null && (
    typeof input.supplierOrderReference !== "string" || input.supplierOrderReference.trim().length > 240
  )) return "Supplier order reference must be text up to 240 characters";
  if (input.trackingNumber !== undefined && input.trackingNumber !== null && (
    typeof input.trackingNumber !== "string" || input.trackingNumber.trim().length > 160
  )) return "Tracking number must be text up to 160 characters";

  if (["accepted", "processing", "shipped", "in_transit", "delivered"].includes(nextStatus) && !nextReference) {
    return "A supplier order reference is required once the supplier accepts the order";
  }
  if (["shipped", "in_transit", "delivered"].includes(nextStatus) && !nextTracking) {
    return "A tracking number is required before marking the order shipped or delivered";
  }
  return null;
}
