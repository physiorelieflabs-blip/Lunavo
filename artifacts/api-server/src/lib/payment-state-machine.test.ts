import { describe, expect, it } from "vitest";
import { assertValidTransition, canBeRefunded, isFinalState, isValidTransition } from "./payment-state-machine";

describe("payment state machine", () => {
  it("permits only legitimate forward transitions", () => {
    expect(isValidTransition("created", "initialized")).toBe(true);
    expect(isValidTransition("processing", "successful")).toBe(true);
    expect(isValidTransition("failed", "successful")).toBe(false);
    expect(isValidTransition("successful", "successful")).toBe(false);
  });

  it("keeps successful payments reversible until refund/dispute resolution", () => {
    expect(isFinalState("successful")).toBe(false);
    expect(canBeRefunded("successful")).toBe(true);
    expect(isFinalState("chargeback")).toBe(true);
  });

  it("throws on illegal transitions", () => {
    expect(() => assertValidTransition("expired", "successful")).toThrow(
      "Invalid payment state transition",
    );
  });
});
