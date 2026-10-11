import { describe, expect, it } from "vitest";
import { calculateSupplierSellingPrice } from "./supplier-pricing";
describe("shared supplier pricing rule", () => {
  it("supports fixed markup", () => expect(calculateSupplierSellingPrice("10.00", "fixed", "4", "fixed_markup")).toBe(14));
  it("supports percentage markup", () => expect(calculateSupplierSellingPrice("10.00", "percentage", "25", "percentage_markup")).toBe(12.5));
  it("supports same-price and custom modes", () => {
    expect(calculateSupplierSellingPrice("10.126", "fixed", "9", "same_price")).toBe(10.13);
    expect(calculateSupplierSellingPrice("10.00", "fixed", "0", "custom", "17.99")).toBe(17.99);
    expect(calculateSupplierSellingPrice("10.00", "fixed", "0", "custom", null)).toBeNull();
  });
  it("does not invent a price without supplier cost", () => expect(calculateSupplierSellingPrice(null, "fixed", "4", "fixed_markup")).toBeNull());
});
