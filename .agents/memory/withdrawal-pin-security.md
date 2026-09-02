---
name: Withdrawal PIN security
description: The required PIN set and storage boundary for merchant and master-admin withdrawal actions.
---

Merchant withdrawal requests require exactly two distinct six-digit PINs. Master-admin withdrawal requests, review actions, and destination reveals require exactly five distinct six-digit PINs. PIN values are accepted only over the authenticated request, stored as salted scrypt hashes, and never returned by the API.

**Why:** Withdrawals are an irreversible financial action; a single session or authenticator code should not be the only control, and plaintext PIN storage would create unnecessary credential exposure.

**How to apply:** Keep the PIN count and verification at the server boundary for every new withdrawal-related endpoint. UI validation is only a convenience; it must never replace server-side verification.