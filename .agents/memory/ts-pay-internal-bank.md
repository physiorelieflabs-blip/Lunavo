---
name: TS Pay internal bank
description: TS Pay is an internal ledger and transfer layer, while external withdrawals remain uncompleted payout instructions.
---

TS Pay internal transfers are platform-native ledger movements: lock both accounts in deterministic order, enforce same-currency available-balance checks, and post one debit plus one credit under a merchant-scoped idempotency key.

**Why:** TS Commerce must not represent a connected provider or an approved withdrawal instruction as its own banking settlement rail.

**How to apply:** Keep internal balances derived from authoritative ledger entries and holds; keep external bank payouts in the withdrawal workflow until a real regulated rail confirms settlement.