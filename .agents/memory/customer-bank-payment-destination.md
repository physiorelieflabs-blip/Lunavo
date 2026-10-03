---
name: Customer bank payment destination
description: Published store checkout must never expose a merchant-owned bank account as a direct payment destination; bank transfer payments use a provider-returned Flutterwave destination tied to a verified payment session.
---

Lunavo does not publish a merchant's linked withdrawal bank account to shoppers. A public checkout may display bank details only when those details were returned by the configured regulated payment provider for the specific payment attempt. The provider destination is temporary/session-bound and is not a merchant-owned account exposed by Lunavo.

**Why:** Every customer money movement must enter Lunavo through the dashboard/payment orchestration boundary. Merchant bank accounts are payout destinations only; exposing them as direct checkout destinations would create an off-ledger payment bypass.

**How to apply:** Keep merchant bank-account records scoped to withdrawals. Public checkout must create a payment intent, obtain a real provider destination or hosted provider checkout, and mark an order paid only after server-side provider verification and ledger posting. Reject fixed merchant bank destinations and never expose withdrawal account ciphertext or details to shoppers.
