/**
 * Payment lifecycle state machine.
 * Ensures payment transitions follow valid paths and prevents invalid state changes.
 */

export type PaymentState =
  | "created"
  | "initialized"
  | "pending"
  | "processing"
  | "successful"
  | "failed"
  | "cancelled"
  | "expired"
  | "refunded"
  | "disputed"
  | "chargeback";

const VALID_TRANSITIONS: Record<PaymentState, PaymentState[]> = {
  created: ["initialized", "cancelled"],
  initialized: ["pending", "failed", "cancelled", "expired"],
  pending: ["processing", "failed", "cancelled", "expired"],
  processing: ["successful", "failed"],
  successful: ["refunded", "disputed", "chargeback"],
  failed: ["cancelled"],
  cancelled: [],
  expired: [],
  refunded: ["disputed"],
  disputed: ["chargeback"],
  chargeback: [],
};

/**
 * Validate a state transition.
 */
export function isValidTransition(from: PaymentState, to: PaymentState): boolean {
  const allowedTransitions = VALID_TRANSITIONS[from] || [];
  return allowedTransitions.includes(to);
}

/**
 * Assert that a transition is valid, or throw.
 */
export function assertValidTransition(from: PaymentState, to: PaymentState): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`Invalid payment state transition: ${from} -> ${to}`);
  }
}

/**
 * Determine if a payment is financially final (no reversals possible).
 */
export function isFinalState(state: PaymentState): boolean {
  return [
    "successful", // Can still be refunded/disputed
    "failed",
    "cancelled",
    "expired",
  ].includes(state);
}

/**
 * Determine if a payment can be refunded.
 */
export function canBeRefunded(state: PaymentState): boolean {
  return state === "successful";
}
