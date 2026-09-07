---
name: Merchant currency settlement
description: Merchant currency changes are preferences for dashboard and new payout records, not automatic foreign-exchange conversion.
---

The merchant currency preference must never silently relabel or convert historical money. Dashboard and withdrawal flows should label new records with the selected currency, while existing orders and payments retain their recorded currency. Customer checkout may collect in another supported currency only when the payment intent stores an immutable settlement amount, settlement currency, FX rate, source, and timestamp; the merchant ledger must post the settlement snapshot, not the provider collection amount. Subscription cycles are the same boundary: convert the USD baseline with an explicit source/rate, lock that quote for the cycle, and use the subscription currency for its payments and ledger activity.

**Why:** Automatic conversion could misstate balances and create unsafe withdrawals; a live FX rate can also drift between invoice display and payment unless the cycle quote is persisted.

**How to apply:** For new checkout or subscription cycles, persist the original amount, converted amount, currency, rate, source, and timestamp. Reprice only before payment/holds exist; if activity exists, keep the historical quote even when the merchant changes their display currency. Public products must also use the merchant settlement currency before they can be active.