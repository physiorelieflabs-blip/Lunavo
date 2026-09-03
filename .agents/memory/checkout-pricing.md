---
name: Checkout pricing snapshots
description: Merchant tax and shipping rules are applied server-side and preserved on each order.
---

Checkout totals must be calculated from merchant rules on the server and stored as subtotal, tax, shipping, and total snapshots on the order. Changing future checkout rules must never relabel or recalculate historical orders.

**Why:** Customer-visible pricing and later financial review need an authoritative record that cannot drift when merchant settings change.

**How to apply:** Treat client-side totals as presentation only; derive the final amount from the catalog and current merchant rules, validate non-negative rates and fees, and use the stored snapshot for receipts, payment verification, refunds, and exports.