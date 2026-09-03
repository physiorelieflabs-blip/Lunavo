---
name: TS Pay payout boundary
description: TS Pay is the internal payout orchestration layer; external bank movement must remain explicit until a regulated bank rail is connected.
---

TS Pay owns payout requests, encrypted destinations, balance reservations, step-up verification, idempotency, audit history, and lifecycle states. It must not mark a payout as externally sent without a real bank-transfer rail and provider confirmation. Merchant store setup does not require a shipping address; the customer supplies the address at checkout. After verified customer payment, a merchant may allocate the recorded supplier cost from the internal ledger before completing any external supplier checkout.

**Why:** An in-house application can safely coordinate and record a payout, but it cannot move money through banking networks by itself.

**How to apply:** Keep manual settlement clearly labeled as manual; require verified customer payment and sufficient tenant balance before supplier-cost allocation; when a regulated rail is added, add provider references, webhook reconciliation, retry policy, and failure/refund handling before enabling automatic external “paid” transitions.