import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateReferralDiscountMinor,
  REFERRAL_DISCOUNT_RATE,
  REFERRAL_FREE_MONTHS,
  REFERRAL_FREE_REFERRAL_MILESTONE,
} from "./referrals";

test("referral discount is 30 percent of the locked gross subscription amount", () => {
  assert.equal(REFERRAL_DISCOUNT_RATE, 0.3);
  assert.equal(calculateReferralDiscountMinor(3000), 900);
  assert.equal(calculateReferralDiscountMinor(12500), 3750);
  assert.equal(calculateReferralDiscountMinor(1), 0);
  assert.equal(calculateReferralDiscountMinor(-500), 0);
});

test("the referral milestone grants one non-cash twelve-month entitlement", () => {
  assert.equal(REFERRAL_FREE_REFERRAL_MILESTONE, 150);
  assert.equal(REFERRAL_FREE_MONTHS, 12);
});