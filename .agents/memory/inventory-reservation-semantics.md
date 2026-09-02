---
name: Inventory reservation semantics
description: The authoritative boundary between checkout holds, verified sales, and externally sourced inventory.
---

Manual numeric inventory is not decremented when a checkout is submitted. Checkout creates a time-bound reservation, and the quantity is decremented only when payment evidence is verified. Cancellation or expiry releases the hold; an approved full refund may add stock back through a compensating movement. Source-based or unknown inventory must never be represented as a guessed numeric quantity.

**Why:** Treating a pending checkout as a completed sale would make unpaid orders permanently consume stock, while treating source availability as local stock would create false inventory guarantees.

**How to apply:** Keep reservation lifecycle changes, stock updates, and immutable movement records in one transaction with merchant/product row locks. Any future fulfillment, cancellation, refund, or manual adjustment path must preserve this boundary.