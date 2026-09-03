---
name: Whop connector boundary
description: Whop connected-account checkout behavior and accounting verification constraints
---

The connected Whop account can create products, plans, and checkout configurations through the authenticated Replit connector proxy, while the MCP checkout helper may reject the same connected-account request when it injects a company scope. Hosted checkout URLs must remain server-created, and local subscription or ledger state must change only after a server-side Whop payment record is verified.

**Why:** The connected account exposed no usable company-list permission, and the MCP checkout operation rejected a company-scoped request even though the raw authenticated proxy succeeded.

**How to apply:** Use the server-only connector proxy for Whop API calls, keep provider IDs in non-secret configuration, match verified payments to the local pending record by checkout identity, amount, currency, and successful provider status, and fail closed for unsupported currencies or lifecycle states. A hosted redirect alone is never payment evidence.