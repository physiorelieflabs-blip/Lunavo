import { describe, expect, it } from "vitest";
import { dropshipStatusTransitionError } from "./dropship-status-policy";

describe("order-level dropshipping transition policy", () => {
  it("requires a supplier reference after supplier acceptance", () => {
    expect(dropshipStatusTransitionError("submitted", "accepted", {})).toMatch(/supplier order reference/);
    expect(dropshipStatusTransitionError("submitted", "accepted", { supplierOrderReference: "SUP-123" })).toBeNull();
  });
  it("requires a supplier reference and tracking number before shipping", () => {
    expect(dropshipStatusTransitionError("processing", "shipped", { currentSupplierOrderReference: "SUP-123" })).toMatch(/tracking number/i);
    expect(dropshipStatusTransitionError("processing", "shipped", { currentSupplierOrderReference: "SUP-123", trackingNumber: "TRK-1" })).toBeNull();
  });
  it("does not permit a direct jump from not submitted to delivered", () => {
    expect(dropshipStatusTransitionError("not_submitted", "delivered", { trackingNumber: "TRK-1" })).toMatch(/Cannot move/);
  });
  it("uses stored reference and tracking when later states do not repeat fields", () => {
    expect(dropshipStatusTransitionError("shipped", "in_transit", { currentSupplierOrderReference: "SUP-123", currentTrackingNumber: "TRK-1" })).toBeNull();
    expect(dropshipStatusTransitionError("in_transit", "delivered", { currentSupplierOrderReference: "SUP-123", currentTrackingNumber: "TRK-1" })).toBeNull();
  });
  it("rejects oversized or non-text evidence", () => {
    expect(dropshipStatusTransitionError("submitted", "accepted", { supplierOrderReference: "x".repeat(241) })).toMatch(/reference/);
    expect(dropshipStatusTransitionError("processing", "shipped", { currentSupplierOrderReference: "SUP-1", trackingNumber: 101 })).toMatch(/tracking number/);
  });
});
