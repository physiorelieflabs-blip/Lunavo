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

Scheduled competitor/ad-spy market watches now validate a public product page before creation, persist the first observation, and run recurring captures on the existing market-research evidence path. Watches are tenant-scoped, idempotent, limited to 30 per merchant, configurable from 60 minutes to 24 hours, and support pause/resume/delete. The worker pins public DNS destinations through the existing importer, preserves capture provenance, retries transient failures with bounded backoff, and marks repeatedly failing watches for manual recovery. All observations remain page-stated evidence rather than checkout truth; the workflow does not change catalog price, stock, orders, payments, or external advertising accounts. Migration 0127 is registered in both canonical and clean-database migration sequences; release CI still needs to verify the exact final branch commit.

Supplier quote negotiation now supports a seven-day, one-use response link. It stores only a SHA-256 token digest, consumes the token atomically with the offer, records provenance, and emits domain events for the merchant workflow. The merchant must share the link manually; automated email/SMS dispatch, external supplier identity proofing, and automatic purchase-order/payment execution are explicitly not claimed. Migration 0124 adds the portal state and is registered in both canonical and clean-database migration sequences. A CI registry guard now checks migration files, list consistency, duplicates, explicit legacy exceptions and bootstrap coverage.

The self-hosted endpoint boundary now normalizes bracketed IPv6 literals before private-network classification, preventing public IPv6 services from being accepted as local inference endpoints. Regression coverage includes private IPv6 acceptance and public IPv6 rejection.

Supplier synchronization hardening also now enforces field-level policy toggles: a missing or unparseable supplier price cannot overwrite the last known source price; a currency mismatch blocks price/currency writes and repricing; stock observations must use recognized states; empty SKU/variant/media/description extraction does not erase existing catalog data; the database compare-and-swap guard rejects stale source fetches after concurrent product edits; price-change review thresholds use exact conservative basis-point arithmetic; and failed polling attempts advance the worker cursor to avoid repeatedly starving the same batch. Regression tests cover missing source fields, stock-status validation, currency boundaries, and price threshold math. These are implementation facts, not a claim that release CI has passed.

## Backup and recovery operations

The Compose stack now includes a self-hosted PostgreSQL backup worker that starts after the application is healthy and startup migrations have completed. It writes custom-format dumps to a dedicated persistent volume, validates generated archive metadata, uses a configurable retention window, and retries failures. CI includes a mocked backup-worker smoke test and a separate container-image build.

The runbook covers archive validation and a non-destructive restore drill into a scratch database. These local backups do not protect against host or volume loss; a production operator must configure and verify independent encrypted copies, define recovery objectives, and perform restore drills before accepting live orders. The worker's running state is not proof of a recent successful backup.

## Verification status

The GitHub Actions verification workflow covers migrations, self-hosted policy, repository secret audit, financial-boundary audit, implementation invariants, production configuration shape, payment/subscription security simulation, unit tests, typecheck, and build.

The latest implementation batch includes connected dropshipping intelligence, persistent command-run records, and a corrected sequential migration path through migration 0124. GitHub check results for the current commit are not yet available through the connected status endpoint; release completion still requires a green CI run for the exact final commit. Each newer commit intentionally superseded/cancelled the prior queued verification run through the workflow concurrency policy. Earlier verification failures were isolated to repository security scanning of non-production fixtures; the scanner has been hardened and later commits superseded the earlier failed/cancelled runs.

Do not mark Lunavo release-complete from feature registry counts alone. Release completion requires a green CI run for the current commit plus environment-specific provider/model configuration checks required by deployment.
