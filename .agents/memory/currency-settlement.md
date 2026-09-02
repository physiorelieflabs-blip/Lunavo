---
name: Merchant currency settlement
description: Merchant currency changes are preferences for dashboard and new payout records, not automatic foreign-exchange conversion.
---

The merchant currency preference must never silently relabel or convert historical money. Dashboard and withdrawal flows should label new records with the selected currency, while existing orders and payments retain their recorded currency.

**Why:** No exchange-rate source or conversion approval exists in the commerce core, so automatic conversion could misstate balances and create unsafe withdrawals.

**How to apply:** If true multi-currency settlement is added later, introduce explicit rates, rounding, ledger entries, and merchant approval before changing historical balances.