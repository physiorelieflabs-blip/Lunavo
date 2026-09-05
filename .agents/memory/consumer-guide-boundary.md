---
name: Consumer guide boundary
description: Safety and data-scope rules for the shopper-facing TS Guide AI.
---

The shopper-facing TS Guide AI is a read-only conversational assistant. It may answer free-form questions and use only public storefront context for store-specific answers. It must not claim to place orders, change orders, issue refunds, confirm payments, change inventory, contact merchants, or access private merchant records.

**Why:** Anonymous shoppers need natural-language help, but the guide must not become an unaudited commerce mutation path or leak tenant-private data.

**How to apply:** Keep the guide endpoint unauthenticated but input-bounded, limit context to published storefront records and public product selling prices, and route all actual commerce changes through the existing checkout or authenticated merchant workflows.