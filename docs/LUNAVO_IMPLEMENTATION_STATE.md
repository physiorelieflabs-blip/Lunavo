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

## Verification status

The GitHub Actions verification workflow covers migrations, self-hosted policy, repository secret audit, financial-boundary audit, implementation invariants, production configuration shape, payment/subscription security simulation, unit tests, typecheck, and build.

The latest implementation batch includes connected dropshipping intelligence, persistent command-run records, and a corrected sequential migration path through migration 0120. GitHub check results for the current commit are not yet available through the connected status endpoint; release completion still requires a green CI run for the exact final commit. Each newer commit intentionally superseded/cancelled the prior queued verification run through the workflow concurrency policy. Earlier verification failures were isolated to repository security scanning of non-production fixtures; the scanner has been hardened and later commits superseded the earlier failed/cancelled runs.

Do not mark Lunavo release-complete from feature registry counts alone. Release completion requires a green CI run for the current commit plus environment-specific provider/model configuration checks required by deployment.
