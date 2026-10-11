import { currencyMinorDigits, toMinorUnits } from "./money";
import type { ImportedSupplierProduct } from "./public-supplier";

export type PublicMarketObservationInput = {
  sourceKind: "competitor" | "ad_spy";
  requestedUrl: string;
  captured: ImportedSupplierProduct;
  capturedAt?: Date;
};

export function buildPublicMarketObservation(input: PublicMarketObservationInput) {
  const { captured } = input;
  const capturedAt = input.capturedAt ?? new Date();
  const priceSource = captured.salePrice !== null
    ? "sale_price"
    : captured.price !== null
      ? "listed_price"
      : "not_available";
  const selectedPrice = captured.salePrice ?? captured.price;
  const observedPriceMinor = selectedPrice === null
    ? null
    : toMinorUnits(selectedPrice, currencyMinorDigits(captured.currency));

  if (selectedPrice !== null && observedPriceMinor === null) {
    throw new Error("The page price could not be converted to currency minor units safely");
  }

  return {
    sourceKind: input.sourceKind,
    sourceUrl: captured.sourceUrl,
    currency: captured.currency,
    observedPriceMinor,
    notes: [
      "Captured public product-page metadata; not a checkout-verified price.",
      `Title: ${captured.title.slice(0, 220)}.`,
      priceSource === "not_available"
        ? "The page did not expose a usable listed or sale price."
        : `Observed ${priceSource.replaceAll("_", " ")}: ${selectedPrice} ${captured.currency}.`,
      captured.availability ? `Page-stated availability: ${captured.availability}.` : "Availability was not exposed by the page.",
    ].join(" "),
    evidence: {
      schemaVersion: 1,
      captureMethod: "public_product_page_metadata",
      evidenceStatus: "page_observed_not_checkout_verified",
      capturedAt: capturedAt.toISOString(),
      requestedUrl: input.requestedUrl,
      resolvedUrl: captured.sourceUrl,
      sourceDomain: captured.sourceDomain,
      extracted: {
        title: captured.title.slice(0, 500),
        descriptionExcerpt: captured.description?.slice(0, 700) ?? null,
        brand: captured.brand,
        sku: captured.sku,
        sourceProductId: captured.sourceProductId,
        listedPrice: captured.price,
        salePrice: captured.salePrice,
        selectedPrice,
        selectedPriceSource: priceSource,
        currency: captured.currency,
        availability: captured.availability,
        availabilityQuantity: captured.availabilityQuantity,
        category: captured.category,
        variantCount: captured.variants.length,
        imageCount: captured.imageUrls.length,
        shippingInformation: captured.shippingInformation,
        sourceMetadata: captured.sourceMetadata,
      },
      caveats: [
        "A visible page price can depend on variant, location, tax, shipping, coupons, account status or checkout state.",
        "Availability and shipping details are seller-published claims and are not independently verified.",
        "No order, inventory mutation, price change, purchase or external publishing action was performed.",
      ],
    } satisfies Record<string, unknown>,
  };
}
