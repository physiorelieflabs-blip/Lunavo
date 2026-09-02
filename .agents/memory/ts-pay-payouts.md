---
name: TS Pay payout boundary
description: TS Pay is the internal payout orchestration layer; external bank movement must remain explicit until a regulated bank rail is connected.
---

TS Pay owns payout requests, encrypted destinations, balance reservations, step-up verification, idempotency, audit history, and lifecycle states. It must not mark a payout as externally sent without a real bank-transfer rail and provider confirmation.

**Why:** An in-house application can safely coordinate and record a payout, but it cannot move money through banking networks by itself.

**How to apply:** Keep manual settlement clearly labeled as manual; when a regulated rail is added, add provider references, webhook reconciliation, retry policy, and failure/refund handling before enabling automatic “paid” transitions.