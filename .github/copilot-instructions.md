# Lunavo — GitHub Copilot Repository Instructions

## Source of truth
- Treat this GitHub repository as the source of truth for Lunavo.
- Work from the branch currently checked out by the user; the primary implementation branch is `feat/lunavo-master-implementation`.
- Inspect the existing codebase before making architectural or feature changes. Do not assume documentation is newer than the implementation.

## Mission
Lunavo is intended to be a self-hosted global commerce OS, not a demo, mock, prototype, or Replit-only application.
Build real, persistent, production-grade functionality. Never invent successful payment, balance, withdrawal, inventory, AI, media, or fulfillment results.

## Required architecture
- PostgreSQL is the authoritative application database.
- Use tenant isolation for every merchant/workspace-owned resource.
- Preserve transactional integrity, row locking where required, idempotency, auditability, and safe retry behavior.
- Flutterwave is the required initial payment rail. Additional provider adapters may be added later.
- Do not make merchants connect direct payment-provider accounts when the platform architecture requires TS Pay to control the provider adapter.
- Never store provider secrets in source code. Use environment/secret storage.
- Payment state must be verified from provider responses/webhooks before money or ledger state is changed.
- Never fabricate balances, transactions, settlements, withdrawals, refunds, disputes, FX, or payment success.
- Master-admin access must be isolated from ordinary merchant authorization and protected with MFA/TOTP, session/device controls, login alerts, and audit logging.
- Prefer first-party/self-hosted implementations for core infrastructure. Do not introduce Clerk/Auth0/Firebase/Supabase/AWS/Vercel/Netlify/Stripe/PayPal/SendGrid/Twilio/Algolia/Pinecone as hidden core dependencies without an explicit architectural decision.

## TS Pay / financial rules
- TS Pay is a control/orchestration and ledger layer, not a fake bank account or fake wallet.
- Model checkout/payment sessions, provider verification, webhook processing, ledger entries, settlement currencies, provider fees, the TS 1% platform fee, net merchant balances, refunds, disputes, withdrawals, reconciliation, routing, reserves and chargebacks explicitly.
- Every money-changing operation must be idempotent and auditable.
- Prevent duplicate payment processing and concurrent balance corruption.
- Manual withdrawal requests remain manual unless a real payout integration is explicitly implemented and verified.
- Never mark a payment paid merely because a customer returned from a hosted checkout page.

## Product requirements
Keep these product areas connected end-to-end to the real API/database:
- merchant/store onboarding and authentication
- products/catalog and supplier ingestion
- persistent media library and product imagery
- storefronts and public checkout
- orders/customers/inventory/fulfillment
- TS Pay payments, ledger, fees, refunds, disputes and withdrawals
- referrals and marketplace
- subscriptions and advertising
- CRM/customer communication
- AI merchant operator with approval-gated actions
- admin controls, audit logs, security and reporting
- responsive mobile/PWA experience

## AI rules
- AI must use real configured providers/models or clearly report that a required dependency is unavailable.
- Never substitute hardcoded answers, fake model output, silent mocks, or pretend execution for missing AI infrastructure.
- AI recommendations must be grounded in actual merchant/store data where claimed.
- AI must not independently move money, approve payouts, publish, message customers, change permissions, or claim settlement.
- Destructive or financial actions require explicit approval and must have execution/rollback history.

## Development workflow
Before changing code:
1. Inspect relevant packages, routes, schemas, migrations, API contracts, frontend, workers, tests, CI, scripts and existing TODO/security notes.
2. Trace the complete data flow before fixing a bug.
3. Identify race conditions, authorization gaps, tenant leaks, missing validation, stale generated code and migration issues.
4. Make the smallest coherent production-grade change; do not rewrite working systems without evidence.
5. Update API contracts/generated clients when applicable.
6. Add or update tests for important behavior, especially money, authorization, concurrency, retries and webhooks.
7. Run typecheck/build and the most relevant tests.
8. Report anything that cannot be genuinely implemented because a required external dependency, credential, infrastructure service or provider capability is unavailable.

## No fake completeness
Do not close a feature as complete because its UI exists. A feature is complete only when its UI, API, authorization, persistence, validation, error handling and relevant tests are connected and functional.

## Security
- Never expose secrets, tokens, webhook secrets, credentials or private keys.
- Validate all untrusted input with the project's validation layer.
- Enforce authorization server-side; never rely on frontend route hiding.
- Protect webhooks against spoofing, replay and duplicate delivery.
- Use secure password/session/token handling where applicable.
- Audit privileged and financial operations.
- Never weaken security merely to make a test or demo pass.

## Repository hygiene
- Do not delete existing functionality merely because it is inconvenient.
- Do not add generated artifacts, local databases, credentials or secrets to Git.
- Preserve existing package-manager conventions: this repository uses pnpm.
- Keep documentation accurate when architectural behavior changes.
