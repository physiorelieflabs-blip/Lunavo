/**
 * A provider-confirmed charge can be posted as a normal order sale only while
 * the order is still pending. Settlements racing with cancellation, expiry or
 * another state transition must go through reconciliation, not fulfillment.
 */
export function mayPostProviderSale(orderStatus: string | null | undefined): boolean {
  return orderStatus === "pending";
}
