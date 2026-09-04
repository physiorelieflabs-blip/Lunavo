---
name: Flutterwave provider boundary
description: Flutterwave is the only initial external rail; TS Commerce remains authoritative for payment verification and accounting
---

Flutterwave may host checkout and process external payment, but TS Commerce must create the pending intent, lock and verify transaction ID/reference/amount/currency, and own all sale, subscription, refund, inventory, and ledger state transitions. Duplicate returns and webhooks must converge on the same locked result.

**Why:** A hosted payment page is only an authorization attempt; provider callbacks can be duplicated, delayed, reversed, or mismatched. Keeping settlement inside TS Commerce prevents replayed money or stock changes and keeps the external rail replaceable.

**How to apply:** Put provider calls behind the Flutterwave adapter. Store raw webhook deliveries with provider-scoped idempotency, use the same verification path for browser returns and webhooks, and never let a provider response directly mutate money or stock outside a database transaction.