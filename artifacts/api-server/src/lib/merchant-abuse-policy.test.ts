import assert from "node:assert/strict";
import test from "node:test";
import {
  auctionBidIsValid,
  canTransferStoreOwnership,
  connectorMayPublish,
  hasSelfPurchaseConflict,
  inventoryCanDecrement,
  isSafeAutomationCount,
  paymentCanCreateRevenue,
  paymentCanBeRetried,
  referralAccountsConflict,
  shouldFlagAuctionVelocity,
} from "./merchant-abuse-policy";

test("self purchases and same-email purchases are blocked", () => {
  assert.equal(hasSelfPurchaseConflict({ merchantId: 1, sellerMerchantId: 1, buyerMerchantId: 1 }), true);
  assert.equal(hasSelfPurchaseConflict({ merchantId: 1, sellerMerchantId: 1, buyerMerchantId: 2, sellerEmail: "seller@example.com", buyerEmail: "SELLER@example.com" }), true);
  assert.equal(hasSelfPurchaseConflict({ merchantId: 1, sellerMerchantId: 1, buyerMerchantId: 2, sellerEmail: "seller@example.com", buyerEmail: "buyer@example.com" }), false);
});

test("referral self-collusion is blocked", () => {
  assert.equal(referralAccountsConflict({ referrerMerchantId: 4, referredMerchantId: 4 }), true);
  assert.equal(referralAccountsConflict({ referrerMerchantId: 4, referredMerchantId: 5, referrerEmail: "a@example.com", referredEmail: "A@example.com" }), true);
});

test("automation limits are bounded server-side", () => {
  assert.equal(isSafeAutomationCount(0), true);
  assert.equal(isSafeAutomationCount(10_000), true);
  assert.equal(isSafeAutomationCount(10_001), false);
  assert.equal(isSafeAutomationCount(-1), false);
});

test("only provider-verified payments can create revenue", () => {
  assert.equal(paymentCanCreateRevenue("successful", true), true);
  assert.equal(paymentCanCreateRevenue("successful", false), false);
  assert.equal(paymentCanCreateRevenue("pending", true), false);
});

test("retry states never authorize revenue by themselves", () => {
  assert.equal(paymentCanBeRetried("failed"), true);
  assert.equal(paymentCanBeRetried("successful"), false);
});

test("inventory only decrements after verified sale and sufficient stock", () => {
  assert.equal(inventoryCanDecrement({ paymentVerified: true, orderState: "paid", quantity: 2, availableQuantity: 2 }), true);
  assert.equal(inventoryCanDecrement({ paymentVerified: false, orderState: "paid", quantity: 2, availableQuantity: 2 }), false);
  assert.equal(inventoryCanDecrement({ paymentVerified: true, orderState: "pending", quantity: 2, availableQuantity: 2 }), false);
  assert.equal(inventoryCanDecrement({ paymentVerified: true, orderState: "paid", quantity: 3, availableQuantity: 2 }), false);
});

test("external publishing requires a live authorized connector", () => {
  assert.equal(connectorMayPublish({ connected: true, authorized: true, revoked: false }), true);
  assert.equal(connectorMayPublish({ connected: true, authorized: false, revoked: false }), false);
  assert.equal(connectorMayPublish({ connected: true, authorized: true, revoked: true }), false);
});

test("store ownership cannot transfer before closed auction and verified payment", () => {
  const base = { storeId: 10, currentOwnerId: 1, buyerMerchantId: 2, auctionClosed: true, paymentVerified: true };
  assert.equal(canTransferStoreOwnership(base), true);
  assert.equal(canTransferStoreOwnership({ ...base, auctionClosed: false }), false);
  assert.equal(canTransferStoreOwnership({ ...base, paymentVerified: false }), false);
  assert.equal(canTransferStoreOwnership({ ...base, buyerMerchantId: 1 }), false);
});

test("auction bids must beat the current bid inside the active window", () => {
  const base = { auctionActive: true, startsAt: new Date("2026-09-12T09:00:00Z"), endsAt: new Date("2026-09-12T11:00:00Z"), amount: 101, currentBid: 100, increment: 1, now: new Date("2026-09-12T10:00:00Z") };
  assert.equal(auctionBidIsValid(base), true);
  assert.equal(auctionBidIsValid({ ...base, amount: 100.5 }), false);
  assert.equal(auctionBidIsValid({ ...base, now: new Date("2026-09-12T12:00:00Z") }), false);
});

test("auction velocity is flagged before manipulation can become invisible", () => {
  assert.equal(shouldFlagAuctionVelocity(12), true);
  assert.equal(shouldFlagAuctionVelocity(11), false);
});
