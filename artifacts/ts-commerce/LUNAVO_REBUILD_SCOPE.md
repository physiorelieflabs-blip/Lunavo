# Lunavo rebuild scope

This document is a guardrail for the direct GitHub rebuild. It is not a substitute for implementation.

## Product surfaces that must remain in scope

Merchant OS: overview, orders, products, inventory, customers, marketing, analytics, store builder, themes, branding, marketplace, shipping, taxes, payments, payouts, discounts, reviews, digital products, courses, memberships, services, bookings, events, subscriptions, domains, integrations, API, settings.

Commerce: physical products, digital commerce, courses, memberships, services, appointments/bookings, events/tickets, subscriptions, storefronts, marketplace and customer accounts.

TS Pay: checkout, payment links, invoices, balances, internal ledger, fees, refunds, disputes, payout requests, reconciliation, fraud/risk rules and reporting. TS Pay is the first-party operating/control layer, not a bank account or fictional payment destination. Real payment movement remains dependent on an actual payment rail; Flutterwave is the initial rail and other providers are adapters.

Financial integrity: provider-authenticated payment success, webhook verification, provider re-query, idempotency, reference/amount/currency/store/order matching, transaction versus settlement currency, actual provider fee, Lunavo 1% fee, merchant net, refunds, reversals, disputes, chargebacks and reconciliation exceptions.

Commercial rules: $30/month merchant subscription, unlimited stores and included features; optional marketplace $5/month plus $5 per listed product; 1% transaction fee; monthly referral code after a verified subscription payment; qualifying referral earns 30% ($9) off the next subscription period; rewards are idempotent and never represented as cash.

Platform: Master Admin, merchant verification/KYC, payouts, staff authorization, audit logs, security, sessions, 2FA, domains, shipping, tax, CRM, notifications, marketing, APIs, webhooks, mobile/web parity, integrations and system settings.

Intelligence: self-hosted local language/image/video workflows, Commerce Suite and Frontier Lab. Intelligence may assist commerce work but cannot move money, confirm payments, alter the ledger or bypass authorization.

Supplier ingestion: merchants provide supplier/product URLs directly; public product information may be extracted where technically and legally possible, then reviewed, mapped and edited before import. Merchants do not need to paste supplier API keys.

## Build discipline

1. GitHub is the source of truth.
2. Replit is only for sync/runtime testing; Replit Agent must not implement product changes.
3. Existing backend logic, APIs, authentication, payment verification and business rules are preserved unless a required implementation fix is necessary.
4. Never use fabricated financial data as real account data.
5. Never claim a feature is implemented merely because a navigation item exists.
6. Before declaring the rebuild complete, inspect routes, implementations, business logic, permissions and CI/runtime evidence repeatedly.
