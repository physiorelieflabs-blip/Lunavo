# Agent instructions for Lunavo

## Source of truth
- This Git repository is the source of truth; use it for development and deployment review.
- Read `docs/LUNAVO-MASTER-SPEC.md`, `docs/LUNAVO_FEATURE_CATALOG.md`, and `docs/LUNAVO_IMPLEMENTATION_STATE.md` before substantial architecture changes.
- Preserve existing functionality unless a change explicitly replaces it. Prefer small reviewable changes over broad rewrites.

## Non-negotiable boundaries
- PostgreSQL is authoritative for tenant, commerce, inventory, subscription, payment and financial state.
- Never trust browser values to establish price, payment success, balances, role, inventory availability or settlement. Verify payment server-side against Flutterwave before recording success.
- Keep money in exact integer minor units at calculation boundaries. Preserve transaction currency separately from settlement currency. Make provider callbacks, retries, refunds, withdrawals, inventory reservations and event processing idempotent.
- Flutterwave is the only external real-money payment provider. Do not add hosted payment rails or assume payment credentials exist. Missing credentials must leave affected features unavailable, not simulated.
- AI and automation may advise or prepare changes, but cannot bypass tenant authorization, payment verification, inventory, budgets, approvals or audit logging.
- Core intelligence, object storage, FX, and mail must retain the self-hosted boundary. Do not add hosted AI keys, SaaS database/auth dependencies, third-party analytics beacons, remote SMTP assumptions or fake fallback data.
- Supplier URL ingestion must retain SSRF protection and must not require a supplier API key.
- Never represent a demo, preview, queued action, or configured endpoint as confirmed live service activity.

## Working practices
- Inspect the existing route, database schema, generated API contract, worker and UI before adding a duplicate capability.
- Add/modify authorization and tenant isolation on the server for every protected action; hiding a button is not authorization.
- For schema changes, create the next sequential migration and register it in every canonical migration sequence. Do not rewrite an already-applied migration.
- Update the generated OpenAPI/Zod/client artifacts when API contracts change. Add regression tests for money, idempotency, security and state-transition behavior.
- Do not store provider secrets in logs, responses, source files, screenshots or browser storage.
- Avoid claiming a capability is complete merely because a route or button exists. Verify persistence, failure handling, authorization, observable provider success and tests.

## Verification
Run the relevant tests and, when possible, all of these before proposing a release:

```sh
pnpm check:self-hosted
pnpm check:migrations
pnpm run typecheck
pnpm test
pnpm run build
```

A release is not complete until the CI workflow is green on the exact final commit and deployment-specific preflight checks pass. Report any check you could not run; do not infer success.
