import assert from "node:assert/strict";
import test from "node:test";
import { canonicalInvoiceLine, canonicalMoneyMinor, invoiceStatusForDueDate } from "./invoice-logic";

test("invoice arithmetic canonicalizes valid decimal quantities and cents", () => {
  assert.deepEqual(canonicalInvoiceLine(1.25, 19.99), { quantityMilli: 1250, unitPriceMinor: 1999, lineTotalMinor: 2499 });
  assert.equal(canonicalMoneyMinor(10.5, "Tax"), 1050);
});
test("invoice arithmetic rejects unsupported precision", () => {
  assert.throws(() => canonicalInvoiceLine(1.0001, 10));
  assert.throws(() => canonicalMoneyMinor(0.001, "Tax"));
});
test("overdue calculation preserves non-collectible statuses", () => {
  const now = new Date("2025-05-02T12:00:00Z");
  assert.equal(invoiceStatusForDueDate("sent", "2025-05-01", now), "overdue");
  assert.equal(invoiceStatusForDueDate("void", "2025-05-01", now), "void");
});