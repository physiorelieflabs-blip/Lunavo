import { describe, expect, it } from "vitest";
import { multiplyMinorUnits, toMinorUnits } from "./money";

describe("exact monetary conversion", () => {
  it("converts decimal text without floating-point drift", () => {
    expect(toMinorUnits("0.10")).toBe(10);
    expect(toMinorUnits("12.34")).toBe(1234);
    expect(toMinorUnits("1.005")).toBe(101);
    expect(toMinorUnits("1.004")).toBe(100);
  });

  it("rounds provider decimals explicitly and preserves signs", () => {
    expect(toMinorUnits("9.999")).toBe(1000);
    expect(toMinorUnits("-1.005")).toBe(-101);
    expect(toMinorUnits(Number.NaN)).toBeNull();
    expect(toMinorUnits("not-money")).toBeNull();
  });

  it("uses safe integer arithmetic for quantity multiplication", () => {
    expect(multiplyMinorUnits(1299, 3)).toBe(3897);
    expect(multiplyMinorUnits(1_000_000_000, 10)).toBe(10_000_000_000);
    expect(multiplyMinorUnits(Number.MAX_SAFE_INTEGER, 2)).toBeNull();
  });
});
