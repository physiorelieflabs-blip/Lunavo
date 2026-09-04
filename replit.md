# TS Commerce

TS Commerce is an authenticated merchant workspace for catalog import, public order capture, transaction review, fee holds, withdrawals, and internal dropshipping fulfillment.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server on the configured `PORT`
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `PORT`, `SESSION_SECRET`, `CLERK_PUBLISHABLE_KEY`, and `CLERK_SECRET_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ts-commerce` — Clerk-authenticated merchant and public checkout web app
- `artifacts/api-server` — Express API, authorization, financial transitions, fulfillment routing, and health check
- `lib/db/src/schema/commerce.ts` — PostgreSQL/Drizzle commerce schema
- `lib/db/migrations` — ordered production-safe schema migrations
- `lib/api-spec/openapi.yaml` — source of truth for API contracts and generated clients

## Architecture decisions

- Clerk is the only authentication system. Master-admin access is restricted to the verified canonical primary email in both client routing and the API.
- Merchant balance changes happen inside database transactions with row locks, idempotency keys, and activity records.
- Public supplier pages are read only when safely reachable over HTTP(S); no supplier API key is required or stored.
- Public checkout creates a pending order. It does not claim a card charge; an authenticated merchant must confirm payment before revenue and fee holds change.
- Approved withdrawals are manual admin payouts unless a future payout integration is explicitly connected.

## Product

- Clerk sign-in and verified master-admin controls
- Merchant dashboard for revenue, real orders, customers, held earnings, and withdrawal reservations
- Public-link product import with supplier links and fixed or percentage profit rules
- Shareable public storefront checkout that creates idempotent pending orders
- Merchant payment confirmation/cancellation and internal auto-DS fulfillment queue
- Subscription fee payment from held earnings or reviewed partial bank-transfer submissions
- Linked bank account management, authenticator-app TOTP, and admin-reviewed withdrawals

## User preferences

- Supplier product workflows must not require merchants to enter supplier API keys.

## Feature completeness contract

Do not treat TS Commerce as complete until these product areas are implemented, connected to the tenant-scoped API/database, and smoke-tested through the UI:

- **Business AI operator:** a real merchant copilot grounded in sales, orders, customers, catalog, inventory, suppliers, marketing, finance, storefront, and subscription data; natural-language business questions; explainable recommendations; citations or source signals; and approval-gated actions with execution and rollback history. AI must never independently publish, send customer messages, change permissions, move money, approve payouts, or claim payment settlement.
- **Store media library:** merchant image uploads with persistent object storage, file/type/size validation, ownership checks, alt text, ordering, deletion, replacement, and an asset picker usable from products and storefront sections.
- **AI store imagery:** approved AI image generation and editing for product photography, product cutouts, banners, hero sections, ad creative, and social variants; prompts must support product context and brand style; generated assets must enter the media library before storefront publication.
- **Catalog-to-storefront path:** product media galleries, active/visible/priced public products, product detail pages, store hero/banner imagery, published preview, custom sections/themes, SEO metadata, domain readiness, and checkout from the public storefront.
- **Checkout and payments:** truthful pending/verified payment states, Flutterwave test/live visibility without exposing credentials, transaction verification, webhook deduplication, refunds, fees, TS Pay ledger posting, payout holds, and interrupted hosted-return recovery.
- **Merchant settings:** persistent account profile, store profile, currency, tax, shipping, checkout, payment, notification, security/password, theme, publishing, domain, location, role, and workspace settings with clear errors and refresh-safe saved values.
- **Commerce operations:** supplier ingestion, catalog editing, stock reservations, low-stock purchase workflow, fulfillment, returns/refunds, invoices, payment links, POS, receipts, marketplace listings, auctions, General Store, subscriptions, advertising, CRM, customer notes/segments, loyalty, referrals, and marketing eligibility.
- **Communication and mobile:** merchant-selected alerts, consent-aware customer communication, responsive mobile/PWA support, installable storefront experience, and offline-safe fee/suspension behavior.
- **Quality gates:** authenticated browser coverage for settings and money flows, concurrency tests for balances/withdrawals/inventory/retries, regional date and currency tests, API-codegen freshness, production migration registration, and publish-readiness checks.

Current platform blocker: managed AI provider and persistent App Storage provisioning are unavailable in this workspace. Do not replace them with silent mock data or non-persistent local files; resume the real AI/media implementation when those services are available.

## Gotchas

- Public checkout is order capture plus payment confirmation, not card processing. A payment provider is required before claiming online card payments.
- Supplier checkout remains a deliberate manual handoff for public or login-only supplier pages.
- Run API code generation after changing `openapi.yaml`, then run typecheck and build before restarting workflows.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
