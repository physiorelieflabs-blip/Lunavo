---
name: Admin ledger boundary
description: The backoffice admin identity needs an isolated ledger anchor for its own payout security and balance operations.
---

The master admin's own TS Pay security and payout operations use a dedicated admin ledger merchant record that is not exposed as a merchant workspace membership.

**Why:** Merchant workspace resolution intentionally rejects the master admin identity. Reusing that resolver made admin payout security and bank-destination screens fail, while treating platform-wide revenue as an admin withdrawal balance would be unsafe.

**How to apply:** Keep merchant workspace routes membership-scoped. Use the admin ledger anchor only for admin-owned bank destination, withdrawal security, admin withdrawal requests, and admin ledger balance; merchant withdrawal review remains a separate admin-only queue. Subscription bank payments may credit this ledger only after an admin confirms the under-review transfer, with no external settlement claim.