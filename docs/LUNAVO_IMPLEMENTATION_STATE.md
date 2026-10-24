# Lunavo — Implementation State

This document records the current build state of `feat/lunavo-master-implementation`.

## Product boundary

Lunavo is a self-hosted global commerce operating system. PostgreSQL is authoritative for commerce and financial state. Flutterwave is the required external payment rail; provider access remains behind server-side adapters and verification boundaries.

The web client is an operating surface, not the source of truth for money, permissions, inventory, subscriptions, or provider settlement.

## Core domains

The current codebase contains merchant/storefront management, product catalog and product types, checkout/orders, inventory/warehouses, suppliers and URL-only sourcing, dropshipping/fulfillment, marketplace/listings, auctions, POS, invoices/payment links, customer accounts and engagement, loyalty/affiliate/gift-card/discount capabilities, subscriptions, marketing, social gateway, Ad Studio/media, AI Control Room, Autopilot, automation workflows, analytics, finance/withdrawals, Master Admin operations, API keys, feature flags/experiments, exports/deletion, and connected domain-event processing.

## Connected-system architecture

Authoritative mutations emit tenant-scoped idempotent domain events with actor, source, before/after, correlation, and causation context. The outbox worker claims events with row locking, projects notifications, dispatches automation, retries failures, and supports dead-letter state.

Important workflows use server-side state transitions and idempotency. Inventory reservations, payment settlement, subscription entitlement, auctions, refunds, withdrawals, and automation runs are protected against duplicate execution.

## Payment boundary

Financial values use exact minor units at trusted calculation boundaries. Lunavo's 1% fee is calculated without floating-point arithmetic. Provider fees remain distinct from the Lunavo platform fee. Webhook callbacks are treated as signals; Flutterwave is re-queried before trusted settlement.

Withdrawal webhook reconciliation now compares provider and internal amounts using exact minor units rather than floating-point tolerance. Subscription settlement/refund, referral discounts, product/store auction settlement, and auction bid increments were also hardened to exact minor-unit arithmetic.

## Self-hosted AI boundary

AI profiles route to explicitly configured local/self-hosted model endpoints. Runtime endpoint validation rejects public cloud-hosted AI endpoints and permits loopback/private/local/Docker-local model hosts only. Ensemble reasoning remains local-to-local and does not introduce cloud fallback.

Supplier enrichment records self-hosted model, profile, timestamp, source URL/domain, authoritative source fields, and generated-vs-extracted provenance. Dynamic pricing recommendations also return explicit provenance describing the inputs and derived recommendations.

## Master Admin control plane

The merchant shell exposes Overview, Merchants, KYC Review, Withdrawals, AI Store Jobs, Integrations & Runtime, and Admin Security. MFA enrollment remains outside the MFA gate so the gate cannot create a redirect loop; the setup page verifies the Master Admin role before allowing enrollment.

## UX wiring

Social Hub is registered in the main merchant router and merchant navigation. Advanced commerce, sourcing, AI, POS, finance, marketplace, automation, and admin surfaces remain inside the unified merchant shell.

## Security and operations

Repository secret auditing distinguishes CI-only fixtures and archived prompt assets from real credential assignments without weakening high-confidence secret detection. Self-hosted policy checks remain in CI. Financial-boundary auditing rejects direct client provider calls and persistent financial state in browser storage.

## Connected dropshipping command plane

The dropshipping intelligence surface now exposes a connected modern-platform parity matrix and a single decision loop spanning sourcing, supplier comparison, price/stock monitoring, landed cost, demand forecasting, inventory, fallback routing, fulfillment, tracking, customer lifecycle, advertising, finance constraints, and automation. Multiple explicitly local specialist roles are synthesized by a local arbiter; deterministic commerce calculations remain authoritative and the resulting plan is persisted as advisory operating memory with idempotent command-run records.

The command plane is not a new authority layer: recommendations feed existing approval, automation, sourcing, inventory, fulfillment, marketing, payment, ledger, and tenant-security boundaries.

Scheduled competitor/ad-spy market watches now validate a public product page before creation, persist the first observation, and run recurring captures on the existing market-research evidence path. Watches are tenant-scoped, idempotent, limited to 30 per merchant, configurable from 60 minutes to 24 hours, and support pause/resume/delete. The worker pins public DNS destinations through the existing importer, preserves capture provenance, retries transient failures with bounded backoff, and marks repeatedly failing watches for manual recovery. All observations remain page-stated evidence rather than checkout truth; only actual observed price/currency or availability changes create merchant alerts, while unchanged snapshots remain in evidence history without notification noise. The workflow does not change catalog price, stock, orders, payments, or external advertising accounts. Migration 0127 is registered in both canonical and clean-database migration sequences; release CI still needs to verify the exact final branch commit.

Supplier quote negotiation now supports a seven-day, one-use response link. It stores only a SHA-256 token digest, consumes the token atomically with the offer, records provenance, and emits domain events for the merchant workflow. The merchant must share the link manually; automated email/SMS dispatch, external supplier identity proofing, and automatic purchase-order/payment execution are explicitly not claimed. Migration 0124 adds the portal state and is registered in both canonical and clean-database migration sequences. A CI registry guard now checks migration files, list consistency, duplicates, explicit legacy exceptions and bootstrap coverage.

The self-hosted endpoint boundary now normalizes bracketed IPv6 literals before private-network classification, preventing public IPv6 services from being accepted as local inference endpoints. Regression coverage includes private IPv6 acceptance and public IPv6 rejection.

Supplier synchronization hardening also now enforces field-level policy toggles: a missing or unparseable supplier price cannot overwrite the last known source price; a currency mismatch blocks price/currency writes and repricing; stock observations must use recognized states; empty SKU/variant/media/description extraction does not erase existing catalog data; the database compare-and-swap guard rejects stale source fetches after concurrent product edits; price-change review thresholds use exact conservative basis-point arithmetic; and failed polling attempts advance the worker cursor to avoid repeatedly starving the same batch. Regression tests cover missing source fields, stock-status validation, currency boundaries, and price threshold math. These are implementation facts, not a claim that release CI has passed.

## Cross-domain event spine

The connected event integration adds workflow triggers for supplier synchronization, sourcing registry creation, single and batch supplier imports, manual catalog changes, accepted supplier refreshes, supplier-sync failures, verified discount redemption, and fulfilment task/order status transitions. Authoritative event records are emitted within the same database transaction as the related mutation, with idempotency keys and tenant scope. Automation Studio exposes these event families alongside the existing dropshipping research, quote portal, and channel-sync events.

These event records are not proof of an external supplier purchase, shipment, or delivery. The fulfilment job events describe Lunavo's internal operational task; an external result must come from a verified adapter/provider response. Payloads deliberately avoid customer contact and address snapshots. The event-spine changes passed the full PR CI suite before merge.

## Backup and recovery operations

The Compose stack now includes a self-hosted PostgreSQL backup worker that starts after the application is healthy and startup migrations have completed. It writes custom-format dumps to a dedicated persistent volume, validates generated archive metadata, uses a configurable retention window, and retries failures. CI includes a mocked backup-worker smoke test and a separate container-image build.

The runbook covers archive validation and a non-destructive restore drill into a scratch database. These local backups do not protect against host or volume loss; a production operator must configure and verify independent encrypted copies, define recovery objectives, and perform restore drills before accepting live orders. The worker's running state is not proof of a recent successful backup.

## Verification status

The GitHub Actions verification workflow covers migrations, self-hosted policy, repository secret audit, financial-boundary audit, implementation invariants, production configuration shape, payment/subscription security simulation, unit tests, typecheck, and build.

The connected market-watch, deployment-hardening, PostgreSQL backup, sourcing/promotion/fulfilment event, and production-launch hardening changes passed GitHub Actions on their reviewed pull-request heads before merge. The final release-candidate head `106722623770010247f66c311cf72dd2c0419df2` passed the full suite including PostgreSQL migration smoke tests, self-hosted policy, repository/security and financial-boundary audits, payment/subscription simulation, unit tests, typecheck, application build, and production container-image build; it was merged as `b400ecb172a409157182125f11845d54104690d4`. The remaining go-live gates are environment-specific: live DNS/TLS and firewall validation, Flutterwave test transactions/webhook reconciliation, local model/FX readiness, tenant isolation testing against a deployed instance, and an independent encrypted backup copy with a successful restore drill.

Do not mark Lunavo release-complete from feature registry counts alone. Release completion requires a green CI run for the current commit plus environment-specific provider/model configuration checks required by deployment.

## Withdrawal holds and spendable-balance hardening

The money-control hardening work on branch `codex/lunavo-money-flow-hardening-2026-10-24` addresses an accounting flaw where a reserved withdrawal could be counted as a positive ledger credit and a provider-confirmed payout could create a zero-value debit. New payout ledger entries use positive reserve markers, negative release markers, and negative paid-withdrawal debits. Spendable-balance queries exclude reserve/release markers and deduct all pending or provider-accepted withdrawals until the provider confirms payout; after a paid payout, the negative ledger debit reduces spendable funds instead of retaining the reservation.

The same active-hold calculation is being applied to merchant dashboard balance reads, dashboard transaction reads, withdrawal requests, TS Pay transfers, supplier-cost allocation, and earnings-funded advertising. Balance-changing requests serialize on the merchant row so a concurrent payout request cannot reuse funds already reserved by a transfer or other spend path. Migration 0128 records a traceable, reconciliation-required adjustment for historical paid withdrawals missing an actual negative payout debit, without mutating immutable ledger entries.

These are code changes, not a claim that all money paths are proven complete. The release must pass the migration registry and PostgreSQL smoke test, financial boundary and implementation audits, unit tests, typecheck, builds, and deployed concurrent-withdrawal/payout reconciliation tests before accepting live orders.

## Master Admin global money control feed

The Master Admin `/admin/transactions` surface exposes the platform-wide dashboard transaction projection, provider verification state, fee/net fields, pending payment intents, unresolved provider reconciliation exceptions, and the pending/approved payout queue. The server route requires the Master Admin identity with MFA and is read-only: it does not create ledger entries, verify a provider transaction, resolve an exception, or mark a payout paid. It complements—not replaces—the immutable TS Pay ledger, provider re-query, existing audited withdrawal approval endpoint, and webhook reconciliation. Provider-backed transactions remain untrusted until verified; a pending payment intent is not a credit, and payout status remains pending/approved until the provider confirms settlement.

This feed is a visibility and control improvement, not proof that the platform's real-world domain, Flutterwave account, bank routing, or external backups are configured. The exact branch must pass CI and the dashboard must be exercised with provider test transactions before enabling live orders.


## Production-launch hardening (2026-10-24)

The production edge now includes an optional Caddy Compose profile for automatic HTTPS issuance and renewal. Public deployments must set `LUNAVO_DOMAIN` and an exactly matching HTTPS `APP_BASE_URL`, point DNS at the host, and expose only the edge ports; the app itself remains on host loopback. Strict preflight rejects the default placeholder hostname, non-HTTPS URLs, malformed PostgreSQL URLs, missing required settings, reused database/session secrets, and weak or placeholder secrets. A separate explicit `preflight:live-money` gate requires provider credentials in the preflight environment; it does not replace a real provider sandbox transaction/reconciliation test.

Master Admin bootstrap is now strictly one-time. An advisory transaction lock serializes bootstrap attempts; existing Master Admin accounts or identity collisions cause a hard failure instead of updating an existing password/role. CI audits the TLS profile, production preflight, workflow fixture and one-time bootstrap invariants. Live DNS, Flutterwave account validity, server firewall, KYC/tenant-isolation proof, local model inference, email deliverability, and independent backup/restore still require verification against the actual deployment.


## Mandatory seller-proceeds release gate (2026-10-24)

Every future positive sale ledger posting automatically creates a pending Master Admin review request and negative `sale_release_hold` entry in the same database transaction. The gate is enforced by the database ledger projection trigger, so it covers card checkout, invoices, manual payment verification, and sale paths that use the same ledger, including auctions. The Global Money Control page exposes the queue and calls an MFA-protected server endpoint. Approval requires a review note, an active merchant, verified payment/auction evidence, and no matching open reconciliation exception; only then is the offsetting `sale_release` credit posted. Webhook reversal cancels unreleased holds, and a dispute after release adds a compensating dispute hold. Existing positive balances are frozen as cutover review items rather than retroactively rewriting historic sale records.
