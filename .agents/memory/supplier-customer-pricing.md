---
name: Supplier versus customer pricing
description: The boundary between imported supplier price data and the merchant-controlled customer price.
---

Supplier product `price` and `salePrice` values are source costs and must never be exposed as shopper discounts or used to calculate a customer charge. Public catalogs, marketplace listings, checkout totals, receipts, and payment-provider amounts must use the merchant-controlled selling price.

**Why:** Imported supplier sale prices can be lower than the merchant's configured price. Treating them as customer-facing prices undercharges the merchant and breaks the accounting boundary.

**How to apply:** When adding or changing a public product serializer, cart, checkout, marketplace listing, payment request, or receipt, trace the value back to the merchant selling-price field and keep source-cost fields internal.