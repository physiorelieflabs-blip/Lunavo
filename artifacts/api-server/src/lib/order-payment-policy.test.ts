import { describe, expect, it } from "vitest";
import { mayPostProviderSale } from "./order-payment-policy";

describe("provider payment vs. order lifecycle", () => {
  it("allows a normal provider settlement only for a pending order", () => {
    expect(mayPostProviderSale("pending")).toBe(true);
  });

  it.each(["cancelled", "paid", "shipped", "delivered", "refunded", "failed", "expired", "unknown", null, undefined])(
    "routes a payment on order state %s to reconciliation",
    (status) => {
      expect(mayPostProviderSale(status)).toBe(false);
    },
  );
});
