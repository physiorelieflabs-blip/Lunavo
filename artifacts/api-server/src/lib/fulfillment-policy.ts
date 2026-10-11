export type FulfillmentTransitionInput = {
  status: string;
  supplierOrderReference?: unknown;
  carrier?: unknown;
  trackingNumber?: unknown;
  trackingUrl?: unknown;
  reason?: unknown;
};
const transitions: Record<string, readonly string[]> = {
  ready: ["approved", "failed"], approved: ["ordered", "failed"], ordered: ["shipped", "failed"],
  shipped: ["delivered", "failed"], delivered: [], failed: ["ready"],
};
function boundedText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;
}
/** Returns a safe input/state error; the mutation still uses tenant scope and compare-and-set. */
export function fulfillmentTransitionError(currentStatus: string, input: FulfillmentTransitionInput): string | null {
  const next = input.status.trim();
  if (!transitions[currentStatus]?.includes(next)) return `Invalid fulfillment transition from ${currentStatus} to ${next || "(empty)"}`;
  if (next === "ordered" && !boundedText(input.supplierOrderReference, 160)) return "A supplier order reference is required before marking a job ordered";
  if (next === "shipped") {
    if (!boundedText(input.carrier, 120)) return "A carrier is required before marking a job shipped";
    if (!boundedText(input.trackingNumber, 160)) return "A tracking number is required before marking a job shipped";
    if (input.trackingUrl !== undefined && input.trackingUrl !== null && input.trackingUrl !== "") {
      const value = boundedText(input.trackingUrl, 1000);
      if (!value) return "Tracking URL is too long or invalid";
      try {
        const url = new URL(value);
        if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return "Tracking URL must be an HTTPS URL without embedded credentials";
      } catch { return "Tracking URL must be a valid HTTPS URL"; }
    }
  }
  if (next === "failed" && input.reason !== undefined && input.reason !== null && typeof input.reason !== "string") return "Failure reason must be text";
  if (next === "failed" && typeof input.reason === "string" && input.reason.trim().length > 500) return "Failure reason is too long";
  return null;
}
