import { describe, expect, it } from "vitest";
import {
  hashSupplierQuotePortalToken,
  issueSupplierQuotePortalToken,
  resolveSupplierQuotePortalBaseUrl,
  supplierQuotePortalUrl,
} from "./supplier-quote-portal";

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

  it("rejects unsafe, malformed or untrusted base URLs", () => {
    for (const value of ["", "not a URL", "javascript:alert(1)", "https://user:secret@example.test", "https://example.test/?token=x", "https://example.test/#fragment"]) {
      expect(() => resolveSupplierQuotePortalBaseUrl(value, "production")).toThrow();
    }
    expect(() => resolveSupplierQuotePortalBaseUrl("http://shop.example.test", "production")).toThrow(/HTTPS/i);
  });
});
