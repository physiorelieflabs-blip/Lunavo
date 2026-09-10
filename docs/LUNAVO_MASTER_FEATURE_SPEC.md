# Lunavo — Master Feature Coverage Specification

This document is the canonical implementation checklist for the Lunavo rebuild. GitHub `main` is the source of truth for development. Replit is intentionally excluded from development.

## 1. Merchant workspace
- Dashboard matching the approved Lunavo merchant reference: dark navigation, KPI cards, AI Control Room, Quick Actions, AI Visual Studio, AI Store Builder, Recent Activity, AI Recommendations, Sales Overview, Billing & Subscription, Referral Program, bank-transfer details, responsive mobile experience.
- Multi-workspace/merchant switching with server-side tenant authorization.
- Search across products, orders, customers and AI tools.
- Notifications, help, profile and theme controls.
- Responsive desktop/tablet/mobile layouts.

## 2. Storefront and commerce
- Store creation and publishing.
- Store builder with templates, drag/drop sections and HTML/CSS customization where safely supported.
- Custom domain and Lunavo subdomain support.
- Removable Lunavo branding where subscription rules permit.
- Product types: physical, digital, courses, memberships, services, bookings, events, tickets and subscriptions.
- Product catalog, variants, SKUs, categories, pricing, media and SEO.
- Public storefront, product pages, cart and checkout.
- Customer accounts, order history and order tracking.
- Coupons/discounts and promotional campaigns.
- Payment links and invoices.
- Auctions and bidding.

## 3. Inventory and operations
- Manual stock with checkout reservation and verified-sale decrement semantics.
- Warehouses, locations and stock transfers.
- Stock reservations and release/expiry.
- Source-based supplier stock is non-authoritative.
- Fulfillment and dropshipping workflows.
- Shipping/tracking records.
- POS.
- Staff/team roles and location-scoped authorization.
- Activity/audit history.

## 4. Supplier sourcing
- Sourcing workspace.
- Supplier URL import without requiring supplier API keys.
- AI extraction of title, description, category, variants, SKU, images, specifications and shipping data where permitted.
- Supplier price is treated as merchant cost; only merchant selling price is exposed to shoppers.
- Safe public-DNS validation/pinning and SSRF protections.
- Live FX data; no hard-coded exchange tables.
- Research evidence and citations with explicit limitations.

## 5. Payments — Lunavo Pay / internal accounting
- First-party payment orchestration and internal ledger as accounting source of truth.
- Provider adapters: Flutterwave initially, with architecture for Paystack, Stripe and PayPal.
- Provider checkout/virtual-account destinations must be real provider-returned data.
- Provider webhooks, server-side verification and idempotency.
- Transaction currency separated from settlement currency.
- Provider fees, Lunavo 1% fee, merchant net, refunds, disputes, reserves and reconciliation.
- Pending/processing/success/failure/expiry/cancellation/refund/dispute/reversal states.
- Hosted return recovery using provider transaction identifiers until verified.
- Refund claim before provider call; local accounting only after provider success.
- Internal same-currency ledger transfers are locked, double-entry and merchant-scoped idempotent.
- External payout claims only after real regulated-rail settlement.
- No fake payment success, fake bank accounts, fake balances or frontend-only money mutations.

## 6. Merchant subscription
- $30/month base subscription.
- Unlimited stores and standard features.
- No free trial or promotional subscription pricing.
- Optional marketplace: $5/month marketplace fee plus $5 per listed product.
- 1% sale transaction fee.
- Server-controlled access/earning window semantics.
- Subscription currency selection with historical-money preservation.
- Billing timezone uses saved IANA timezone and local calendar dates.
- Pay-from-dashboard and provider bank-payment routes.
- Failed/partial subscription obligations carry correctly without relabeling historical money.

## 7. Referral program
- Generate a unique referral code after each verified successful $30 subscription payment.
- Code is valid only for that subscription period and expires at its end.
- New paid month creates a new active code.
- A referred new merchant's first successful $30 subscription produces one fixed $9 discount for the referring merchant's next subscription.
- Referred merchant receives no discount from the referral program.
- Anti-self-referral, anti-collusion and duplicate-account protections.

## 8. Marketplace
- Central marketplace discovery.
- Merchant listings and listing fees.
- Listing review/risk workflow.
- Auto-approval for eligible listings after required payment.
- Risky listings routed for review.
- Marketplace product search, categories and merchant pages.
- Marketplace management dashboard.
- Marketplace advertising compatibility.

## 9. AI Control Room
- General Lunavo AI assistant.
- Marketing specialist.
- Content/SEO specialist.
- Design/image specialist.
- Analytics specialist.
- Operations specialist.
- Customer-support specialist.
- Store-aware recommendations.
- Shopper AI is read-only against public storefront context and cannot mutate orders, payments, stock or merchant data.
- AI-generated facts must remain grounded in available catalog/store data.

## 10. AI Visual Studio and media
- Product image generation.
- Lifestyle/editorial/studio variants.
- Image editing.
- Aspect-ratio controls.
- Media gallery and durable persistence.
- Pollinations image generation where configured.
- Safe fallback when a provider is unavailable.
- Validate image bytes and enforce upload size/type limits.

## 11. Ad Studio and marketing
- Self-hosted deterministic ad planner.
- Optional Gemini planning when configured.
- Catalog-grounded facts.
- Creative prompts are not treated as factual proof.
- Image/video ad generation.
- FFmpeg rendering/stitching.
- Audio-safe long-form stitching with guaranteed audio bed.
- Individual-product and store-wide generation.
- Campaign management, publishing state and analytics.
- Social Hub integrations for Instagram, Facebook, TikTok, YouTube, LinkedIn, Pinterest and X.
- Encrypted OAuth token storage, signed state and replay/idempotency protection.
- X remains disabled until real PKCE support is implemented.
- Do not claim live provider publishing where an adapter is not implemented.

## 12. Analytics and reporting
- Sales, orders, conversion, revenue and product performance.
- Customer analytics.
- Store traffic and growth insights.
- Marketing/ad performance.
- AI recommendations.
- Export/reporting surfaces.
- Historical records must use immutable pricing/tax/shipping snapshots.

## 13. Finance and withdrawals
- Merchant earnings ledger.
- Pending/available balances derived from verified ledger facts.
- 15-day earning-window rules where applicable.
- Manual withdrawal requests.
- Two hashed merchant withdrawal PINs.
- Admin payout review requires five security factors plus authenticator step-up.
- Reconciliation and exception handling.
- No claims of external settlement without provider confirmation.

## 14. Customers and support
- Customer profiles.
- Customer orders, invoices and payment history.
- Customer-facing store experience.
- Help center and support contact workflows.
- Connected customer/order/invoice record views.
- Public customer payment evidence remains unverified until merchant approval where direct bank transfer is used.

## 15. Admin / platform operations
- Separate general/master admin workspace.
- Master-admin merchant discovery and controlled merchant preview.
- Merchant management.
- Withdrawal review.
- Integrations management.
- Platform finance and ledger controls.
- Audit/security controls.
- Separation of admin ledger anchors from merchant workspace membership.
- Role and authorization checks fail closed.

## 16. Authentication and security
- Clerk authentication.
- Verified admin identity checks.
- Secure account settings/password flows through Clerk.
- CSRF/CORS/session/token protections.
- SSRF/XSS/injection defenses.
- Rate limiting on sensitive/public generation and checkout surfaces.
- Idempotency for money and external side effects.
- Tenant isolation and server-side workspace resolution.
- Durable media ownership.
- Secret values only through secure environment/project secrets; never frontend, logs or committed files.
- Domain-event replay rebuilds projections only; never replays authoritative money/stock mutations.

## 17. Integrations and API foundation
- API-independent core architecture.
- Generated API client remains synchronized with exported signatures.
- Explicit ordered database migration runner.
- Webhook processing and reconciliation workers.
- Provider adapter boundaries.
- Secure integration configuration.

## 18. Mobile parity
- Responsive web experience for phone/tablet/desktop.
- Merchant workflows designed for eventual Android/iOS parity.
- Customer browsing, checkout, orders and account flows remain mobile-first.

## 19. Engineering quality gates
Every implementation batch must preserve:
1. Type safety.
2. Database migration registration.
3. API/client synchronization.
4. Server-side authorization.
5. Idempotency for money/external effects.
6. Immutable historical accounting snapshots.
7. Real provider verification boundaries.
8. No fake financial state.
9. No secret leakage.
10. Build/typecheck/security simulation before declaring the batch complete.

## 20. Rebuild rule
**Never use Replit to develop, edit, debug or implement Lunavo.** All code changes are made in GitHub. Replit is only a later deployment/runtime synchronization target when explicitly requested by the owner.
