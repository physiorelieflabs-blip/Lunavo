import { describe, expect, it } from "vitest";
import { fulfillmentTransitionError } from "./fulfillment-policy";
describe("fulfillment transitions and evidence", () => {
  it("requires a supplier reference before declaring an order placed", () => {
    expect(fulfillmentTransitionError("approved", { status: "ordered" })).toMatch(/supplier order reference/);
    expect(fulfillmentTransitionError("approved", { status: "ordered", supplierOrderReference: "SUP-123" })).toBeNull();
  });
  it("requires carrier and tracking before declaring shipment", () => {
    expect(fulfillmentTransitionError("ordered", { status: "shipped" })).toMatch(/carrier/);
    expect(fulfillmentTransitionError("ordered", { status: "shipped", carrier: "Carrier", trackingNumber: "TRACK-1" })).toBeNull();
  });
  it.each(["javascript:alert(1)","http://carrier.example/track/1","https://user:pass@carrier.example/track/1","not a url"])(
    "rejects unsafe tracking URL %s", (trackingUrl) => {
      expect(fulfillmentTransitionError("ordered", { status:"shipped", carrier:"Carrier", trackingNumber:"TRACK-1", trackingUrl })).toMatch(/Tracking URL/);
    });
  it("rejects invalid jumps and permits the documented sequence", () => {
    expect(fulfillmentTransitionError("ready", { status:"shipped", carrier:"Carrier", trackingNumber:"TRACK" })).toMatch(/Invalid fulfillment transition/);
    expect(fulfillmentTransitionError("ready", { status:"approved" })).toBeNull();
    expect(fulfillmentTransitionError("shipped", { status:"delivered" })).toBeNull();
    expect(fulfillmentTransitionError("delivered", { status:"ready" })).toMatch(/Invalid fulfillment transition/);
  });
});
