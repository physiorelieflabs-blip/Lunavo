import { describe, expect, it } from "vitest";
import { conditionsPass, isWorkflowTriggerEvent, safeAction } from "./automation-engine";

const context = {
  eventId: "evt-1",
  eventType: "order.created",
  aggregateType: "order",
  aggregateId: "12",
  merchantId: 7,
  payload: { status: "paid", totalMinor: 12500, tags: ["vip","priority"], customer: { tier: "gold" } },
  before: {},
  after: { status: "paid" },
  source: "test",
};

describe("automation policy evaluator", () => {
  it("registers sourcing and fulfillment in the same workflow trigger spine", () => {
    expect(isWorkflowTriggerEvent("sourcing.source_registered")).toBe(true);
    expect(isWorkflowTriggerEvent("sourcing.product_discovered")).toBe(true);
    expect(isWorkflowTriggerEvent("supplier.product_imported")).toBe(true);
    expect(isWorkflowTriggerEvent("supplier.product_refreshed")).toBe(true);
    expect(isWorkflowTriggerEvent("catalog.product_changed")).toBe(true);
    expect(isWorkflowTriggerEvent("discount.redeemed")).toBe(true);
    expect(isWorkflowTriggerEvent("supplier.observation_changed")).toBe(true);
    expect(isWorkflowTriggerEvent("supplier.sync_failed")).toBe(true);
    expect(isWorkflowTriggerEvent("order.fulfillment_changed")).toBe(true);
    expect(isWorkflowTriggerEvent("fulfillment.job_created")).toBe(true);
    expect(isWorkflowTriggerEvent("fulfillment.status_changed")).toBe(true);
    expect(isWorkflowTriggerEvent("supplier.order_success_faked")).toBe(false);
  });

  it("supports exact, numeric and nested any/all conditions", () => {
    expect(conditionsPass(context, [{ path: "payload.status", op: "eq", value: "paid" }])).toBe(true);
    expect(conditionsPass(context, [{ path: "payload.totalMinor", op: "gte", value: 10000 }])).toBe(true);
    expect(conditionsPass(context, { all: [
      { path: "payload.status", op: "eq", value: "paid" },
      { any: [
        { path: "payload.customer.tier", op: "eq", value: "gold" },
        { path: "payload.customer.tier", op: "eq", value: "platinum" },
      ] },
    ] })).toBe(true);
  });

  it("fails closed for unsafe paths, unsupported values and excessive nesting", () => {
    expect(conditionsPass(context, [{ path: "payload[status]", op: "eq", value: "paid" }])).toBe(false);
    expect(conditionsPass(context, [{ path: "payload.totalMinor", op: "gt", value: "12500" }])).toBe(false);
    let nested: unknown = { path: "payload.status", op: "eq", value: "paid" };
    for (let i = 0; i < 7; i++) nested = { all: [nested] };
    expect(conditionsPass(context, nested)).toBe(false);
  });

  it("permits safe internal actions and blocks privileged feature flags", () => {
    expect(safeAction({ kind: "create_operation", config: { kind: "task", title: "Review order" } })).not.toBeNull();
    expect(safeAction({ kind: "set_feature_flag", config: { key: "checkout.banner", enabled: true } })).not.toBeNull();
    expect(safeAction({ kind: "set_feature_flag", config: { key: "payment.authoritativeBypass", enabled: true } })).toBeNull();
    expect(safeAction({ kind: "create_operation", config: { kind: "payout", title: "Attack" } })).toBeNull();
  });
});
