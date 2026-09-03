import assert from "node:assert/strict";
import test from "node:test";
import { whopMoneyMajor } from "./whop-client";

test("Whop money values accept the provider's object shape", () => {
  assert.equal(whopMoneyMajor({ amount: "19.99", currency: "usd" }), 19.99);
  assert.equal(whopMoneyMajor({ amount: 7.5, currency: "ngn" }), 7.5);
  assert.equal(whopMoneyMajor("4.25"), 4.25);
});

test("malformed Whop money values never become a valid match", () => {
  assert.equal(Number.isFinite(whopMoneyMajor(undefined)), false);
  assert.equal(Number.isFinite(whopMoneyMajor({ currency: "usd" })), false);
});