import { describe, expect, it } from "vitest";
import {
  calculateSupplierQuoteTotalMinor,
  hashSupplierQuotePortalToken,
  issueSupplierQuotePortalToken,
  resolveSupplierQuotePortalBaseUrl,
  supplierQuotePortalUrl,
} from "./supplier-quote-portal";

describe("supplier quote arithmetic", () => {
  it("calculates unit price times quantity plus shipping in exact minor units", () => {
    expect(calculateSupplierQuoteTotalMinor(1_250, 3, 499)).toBe(4_249);
    expect(calculateSupplierQuoteTotalMinor(1, 1, 0)).toBe(1);
    expect(calculateSupplierQuoteTotalMinor(1, 1, 0)).not.toBe(1.01);
  });

  it("rejects invalid inputs and totals outside the safe integer range", () => {
    expect(calculateSupplierQuoteTotalMinor(0, 2, 0)).toBeNull();
    expect(calculateSupplierQuoteTotalMinor(1, 0, 0)).toBeNull();
    expect(calculateSupplierQuoteTotalMinor(1, 1_000_001, 0)).toBeNull();
    expect(calculateSupplierQuoteTotalMinor(1, 1, -1)).toBeNull();
    expect(calculateSupplierQuoteTotalMinor(Number.MAX_SAFE_INTEGER, 2, 0)).toBeNull();
  });
});

describe("supplier quote portal capability links", () => {
  it("issues high-entropy URL-safe tokens and exposes only a SHA-256 digest for storage", () => {
    const issued = issueSupplierQuotePortalToken();
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSupplierQuotePortalToken(issued.token)).toBe(issued.tokenHash);
    expect(issued.tokenHash).not.toContain(issued.token);
  });

  it("rejects malformed tokens before database lookup", () => {
    for (const value of [null, undefined, "", "short", "../" + "a".repeat(43), "a".repeat(42), "a".repeat(44), "a".repeat(42) + "!"]) {
      expect(hashSupplierQuotePortalToken(value)).toBeNull();
    }
  });

  it("builds absolute links from trusted deployment configuration", () => {
    const base = resolveSupplierQuotePortalBaseUrl("https://shop.example.test", "production");
    const token = issueSupplierQuotePortalToken().token;
    expect(supplierQuotePortalUrl(base, token)).toBe("https://shop.example.test/supplier-quote/" + token);
  });

  it("preserves an explicit self-hosted deployment path prefix", () => {
    const base = resolveSupplierQuotePortalBaseUrl("https://shop.example.test/commerce/", "production");
    const token = issueSupplierQuotePortalToken().token;
    expect(supplierQuotePortalUrl(base, token)).toBe("https://shop.example.test/commerce/supplier-quote/" + token);
  });

  it("rejects unsafe, malformed or untrusted base URLs", () => {
    for (const value of ["", "not a URL", "javascript:alert(1)", "https://user:secret@example.test", "https://example.test/?token=x", "https://example.test/#fragment"]) {
      expect(() => resolveSupplierQuotePortalBaseUrl(value, "production")).toThrow();
    }
    expect(() => resolveSupplierQuotePortalBaseUrl("http://shop.example.test", "production")).toThrow(/HTTPS/i);
  });
});
