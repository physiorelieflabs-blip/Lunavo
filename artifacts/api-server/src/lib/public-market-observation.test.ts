import { describe, expect, it } from "vitest";
import type { ImportedSupplierProduct } from "./public-supplier";
import { buildPublicMarketObservation } from "./public-market-observation";

function product(overrides: Partial<ImportedSupplierProduct> = {}): ImportedSupplierProduct {
  return {
    sourceUrl: "https://shop.example/products/item",
    sourceDomain: "shop.example",
    title: "Example Product",
    description: "Public listing description",
    imageUrl: null,
    imageUrls: [],
    videoUrls: [],
    price: "19.99",
    salePrice: null,
    currency: "USD",
    sku: "SKU-1",
    sourceProductId: "item-1",
    variants: [],
    attributes: {},
    availability: "in_stock",
    availabilityQuantity: 12,
    category: "Accessories",
    specifications: {},
    brand: "Example",
    shippingInformation: { deliveryDays: "5-7 days" },
    sourceMetadata: { structuredData: true },
    ...overrides,
  };
}

describe("public market observation provenance", () => {
  it("prefers a visible sale price and records the precise source URL and caveats", () => {
    const result = buildPublicMarketObservation({
      sourceKind: "competitor",
      requestedUrl: "https://shop.example/products/item?variant=blue",
      captured: product({ salePrice: "15.50" }),
      capturedAt: new Date("2026-10-11T10:00:00.000Z"),
    });

    expect(result.observedPriceMinor).toBe(1550);
    expect(result.evidence).toMatchObject({
      captureMethod: "public_product_page_metadata",
      evidenceStatus: "page_observed_not_checkout_verified",
      requestedUrl: "https://shop.example/products/item?variant=blue",
      resolvedUrl: "https://shop.example/products/item",
      sourceDomain: "shop.example",
      capturedAt: "2026-10-11T10:00:00.000Z",
    });
    expect((result.evidence.caveats as string[]).join(" ")).toMatch(/not independently verified/i);
    expect(result.notes).toContain("not a checkout-verified price");
  });

  it("keeps missing prices missing rather than inventing a market number", () => {
    const result = buildPublicMarketObservation({
      sourceKind: "ad_spy",
      requestedUrl: "https://shop.example/products/no-price",
      captured: product({ price: null, salePrice: null }),
    });

    expect(result.observedPriceMinor).toBeNull();
    expect(result.evidence).toMatchObject({
      evidenceStatus: "page_observed_not_checkout_verified",
      extracted: { selectedPrice: null, selectedPriceSource: "not_available" },
    });
  });

  it("uses the observed page currency scale when producing minor units", () => {
    const result = buildPublicMarketObservation({
      sourceKind: "competitor",
      requestedUrl: "https://shop.example/products/item",
      captured: product({ price: "1500", salePrice: null, currency: "JPY" }),
    });
    expect(result.observedPriceMinor).toBe(1500);
  });
});
