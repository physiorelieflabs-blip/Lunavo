---
name: Hosted return recovery
description: Browser return behavior for hosted payment verification
---

Hosted payment return URLs should keep the provider transaction identifier until server-side verification succeeds. A failed verification needs to be reloadable or retryable without asking the customer to recover an identifier manually.

**Why:** Removing the query immediately on page load turns a temporary network or provider failure into a support-only recovery path.

**How to apply:** Clear the URL after a successful or deliberately terminal verification response; preserve it for transient failures.