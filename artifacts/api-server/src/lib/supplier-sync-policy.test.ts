import { describe, expect, it } from "vitest";
import { normalizeSupplierStock, supplierSyncCheckoutError } from "./supplier-sync-policy";

describe("supplier synchronized inventory policy", () => {
  it("normalizes known, zero, and unknown stock without inventing quantities", () => {
    expect(normalizeSupplierStock("in_stock", 8)).toEqual({ inventoryStatus: "available", availabilityQuantity: 8 });
    expect(normalizeSupplierStock("out_of_stock", null)).toEqual({ inventoryStatus: "out_of_stock", availabilityQuantity: 0 });
    expect(normalizeSupplierStock("in_stock", null)).toEqual({ inventoryStatus: "available", availabilityQuantity: null });
    expect(normalizeSupplierStock(null, null)).toEqual({ inventoryStatus: "unknown", availabilityQuantity: null });
    expect(normalizeSupplierStock("in_stock", 1.5)).toEqual({ inventoryStatus: "available", availabilityQuantity: null });
  });
  const valid = {
    inventoryStrategy: "synchronized",
    inventoryStatus: "available",
    availabilityQuantity: 4,
    importStatus: "imported",
    sourceMetadata: { supplierSync: { state: "ready", lastSuccessAt: "2026-10-11T12:00:00.000Z" } },
  };
  it("permits checkout only with fresh, successful, counted supplier stock", () => {
    expect(supplierSyncCheckoutError(valid, Date.parse("2026-10-11T12:10:00.000Z"))).toBeNull();
  });
  it.each([
    [{ ...valid, sourceMetadata: { supplierSync: { state: "syncing" } } }, /being refreshed/],
    [{ ...valid, sourceMetadata: { supplierSync: { state: "failed" } } }, /could not be verified/],
    [{ ...valid, importStatus: "source_unavailable" }, /could not be verified/],
    [{ ...valid, importStatus: "needs_review" }, /need merchant review/],
    [{ ...valid, inventoryStatus: "unknown" }, /unconfirmed/],
    [{ ...valid, availabilityQuantity: null }, /numeric stock quantity/],
    [{ ...valid, sourceMetadata: { supplierSync: { state: "ready", lastSuccessAt: "2026-10-11T10:00:00.000Z" } } }, /stale/],
  ])("blocks unsafe supplier stock %#", (product, message) => {
    expect(supplierSyncCheckoutError(product as typeof valid, Date.parse("2026-10-11T12:10:00.000Z"))).toMatch(message as RegExp);
  });
  it("does not alter manual or source-based inventory behavior", () => {
    expect(supplierSyncCheckoutError({ ...valid, inventoryStrategy: "manual" })).toBeNull();
    expect(supplierSyncCheckoutError({ ...valid, inventoryStrategy: "source_based" })).toBeNull();
  });
});
