import assert from "node:assert/strict";
import { it as test } from "vitest";
import {
  calculateReferralDiscountMinor,
  REFERRAL_DISCOUNT_RATE,
} from "./referral-policy";

test("referral discount is 30 percent of the locked gross subscription amount", () => {
  assert.equal(REFERRAL_DISCOUNT_RATE, 0.3);
  assert.equal(calculateReferralDiscountMinor(3000), 900);
  assert.equal(calculateReferralDiscountMinor(12500), 3750);
  assert.equal(calculateReferralDiscountMinor(1), 0);
  assert.equal(calculateReferralDiscountMinor(-500), 0);
});

