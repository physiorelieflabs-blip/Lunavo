---
name: Flutterwave payout boundary
description: Merchant and admin withdrawals must use a real Flutterwave payout rail; manual settlement references cannot create a paid state.
---

TS Pay owns withdrawal requests, encrypted destinations, balance reservations, step-up security, idempotency and the internal ledger reservation. For currencies with an enabled Flutterwave payout rail, admin approval initiates an idempotent Flutterwave transfer using the immutable withdrawal reference.

A withdrawal may become paid only after the transfer is provider-confirmed successful, either immediately from the verified provider response or through the signed Flutterwave transfer webhook. Failed provider transfers release the reserved ledger amount exactly once. Pending provider transfers remain approved/pending and cannot be manually settled.

No UI field, API request, bank reference, or operator action can manufacture external settlement. If the configured payout rail does not support the withdrawal currency, the request must fail closed rather than falling back to an untracked/manual bank transfer.