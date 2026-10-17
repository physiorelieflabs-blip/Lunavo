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
  it("connects supplier sourcing, supplier sync, and fulfillment events to workflow triggers", () => {
    const registered = [
      "supplier.sync_completed",
      "supplier.sync_review_required",
      "dropship.intelligence.refreshed",
      "dropship.market_research.observed",
      "supplier.quote.portal_issued",
      "supplier.quote.received",
      "channel.sync.completed",
      "channel.sync.partial",
      "channel.sync.failed",
      "channel.sync.cancelled",
      "sourcing.source_registered",
      "supplier.product_imported",
      "supplier.product_refreshed",
      "supplier.observation_changed",
      "supplier.sync_failed",
      "catalog.product_changed",
      "discount.redeemed",
      "order.fulfillment_changed",
      "fulfillment.job_created",
      "fulfillment.status_changed",
    ];
    for (const eventType of registered) expect(isWorkflowTriggerEvent(eventType), eventType).toBe(true);
    expect(isWorkflowTriggerEvent("supplier.order_success_faked")).toBe(false);
    expect(isWorkflowTriggerEvent("customer.address.updated")).toBe(false);
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
