---
name: Merchant currency settlement
description: Merchant currency changes are preferences for dashboard and new payout records, not automatic foreign-exchange conversion.
---

The merchant currency preference must never silently relabel or convert historical money. Dashboard and withdrawal flows should label new records with the selected currency, while existing orders and payments retain their recorded currency. Subscription cycles are the same boundary: convert the USD baseline with an explicit source/rate, lock that quote for the cycle, and use the subscription currency for its payments and ledger activity.

**Why:** Automatic conversion could misstate balances and create unsafe withdrawals; a live FX rate can also drift between invoice display and payment unless the cycle quote is persisted.

**How to apply:** For new subscription cycles, persist the USD base, converted amount, currency, rate, source, and timestamp. Reprice only before payment/holds exist; if activity exists, keep the historical subscription quote even when the merchant changes their display currency.