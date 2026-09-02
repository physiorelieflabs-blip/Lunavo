---
name: AI migration runner
description: New commerce schema migrations must be registered in the explicit migration runner list as well as added to the migrations directory.
---

The database migration process uses an explicit ordered allowlist rather than discovering every SQL file automatically. A migration file alone will not run.

**Why:** The API build can succeed against stale generated database types while the runtime database is still missing the new tables, causing failures only when the feature is exercised.

**How to apply:** Whenever a new commerce migration is added, update the ordered list in the migration runner, restart the API workflow, and confirm the migration ledger contains the new id.