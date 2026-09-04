---
name: Provider refund claiming
description: Concurrency rule for external refund calls and local refund accounting
---

External refund requests must be claimed in the refund record before calling the payment provider. A concurrent approval request should observe the in-flight state and return without issuing a second provider call. Local refund ledger and inventory changes may only be posted after a successful provider response, and provider failures must return the record to a retryable state.

**Why:** The provider call occurs outside the database transaction, so locking only the later accounting transaction still allows two approval requests to send the same refund.

**How to apply:** Use a provider-pending/authorizing state with an idempotency key, preserve successful provider results for recovery after a process crash, and keep failed attempts retryable without posting local money movements.