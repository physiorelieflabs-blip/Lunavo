---
name: POS accounting boundary
description: The invariant separating order creation, payment verification, inventory reservations, and authoritative sale ledger entries.
---

Orders created from merchant or POS surfaces must begin as pending. A client-selected paid or fulfilled status is not accounting evidence; only a verified payment intent may mark the order paid, create the sale ledger entry, decrement manual stock, and reserve the corresponding platform-fee earnings.

Inventory reservations represent temporary checkout holds and must not be recorded as negative stock movements when manual availability has not yet been decremented. Verified sale and refund-restock movements are the authoritative stock deltas; reservation release changes reservation state only.

**Why:** Treating a client-created order as paid could manufacture revenue, and recording both a reservation hold and a verified sale as stock deltas makes movement history appear to sell the same units twice.

**How to apply:** Any new checkout, POS, import, or offline-sync path must create pending orders and use the payment-intent verification boundary before changing paid status, ledger balances, or manual inventory.