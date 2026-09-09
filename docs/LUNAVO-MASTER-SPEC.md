# LUNAVO MASTER REBUILD SPECIFICATION

## Non-negotiable engineering rules
- GitHub is the source of truth for Lunavo.
- All Lunavo coding, fixes, refactors, migrations and frontend work are performed in GitHub.
- Replit Agent must never be used to code or modify Lunavo.
- Replit may only sync, run, preview or publish the GitHub source when explicitly needed.
- Never replace real payment behavior with fake/demo payment behavior.
- Preserve existing working backend contracts while rebuilding the presentation layer unless a contract is intentionally hardened.
- Every feature must be connected to real server-side data and authoritative validation.
- Do not silently remove an existing route or feature during a frontend redesign.
- Do not implement fake counters, fake balances, fake orders, fake reviews, fake inventory or fake payment confirmations as if they were real data.

## Identity and access
- Product name: Lunavo.
- Master Admin email: ifeoluwaolowu4@gmail.com.
- Master Admin display/username: TSAdmin from the established admin setup.
- The admin password is the password the owner sets in the configured authentication provider. Never hardcode, generate, expose or replace it in source code.
- Master Admin access requires the authenticated account to match the approved email and be verified.
- Master Admin must have strong authentication, 2FA support where configured, login alerts, session/device controls, suspicious-login detection and audit logging.
- Merchants have isolated workspaces/dashboards. The platform has a separate master-admin control room.
- Normal account capabilities should include sign up/sign in/sign out, email verification where configured, password reset, session management, profile editing, avatar, preferences, notification preferences, security settings and account deletion/export workflows where applicable.
- Authorization must be role-based and tenant-aware. A merchant must never access another merchant's private data by changing an ID in a URL or request.

## Platform scope
Lunavo is a global commerce platform combining merchant SaaS, independent storefronts, marketplace, payments, logistics, marketing, AI assistance, POS, dropshipping and integrations.

Merchant capabilities include:
- Storefront builder with templates, drag/drop sections, themes, fonts, colors, navigation, popups and custom HTML/CSS.
- Physical products, digital products, online courses, memberships, services/consulting, bookings/appointments, events/tickets and subscriptions.
- Product, variant, SKU, inventory, warehouse, reservation and transfer management.
- Orders, fulfillment, invoices, receipts, refunds, cancellations and status tracking.
- Customers and customer records.
- POS.
- Marketing, advertising and campaign management.
- Analytics and reporting.
- Supplier/product-link ingestion: merchants can paste supplier/product URLs; where technically and legally possible, Lunavo extracts public title, description, images, price, variants, SKU and availability for merchant review/edit/import. Do not require merchants to configure supplier API keys merely to import a product.
- Marketplace listing and management.
- Auctions.
- Team and locations.
- Media library.
- Activity/notifications.
- Billing.
- Finance and withdrawals.
- TS Pay.
- AI Control Room/business copilot with provider-independent core architecture where technically possible.

## Normal application essentials
Lunavo should include the ordinary product-quality capabilities users expect from a modern production SaaS/mobile/web application, even when not separately requested:
- Global responsive shell for desktop, tablet and mobile.
- Search, filtering, sorting, pagination and useful saved views across major data tables.
- Global command/search experience for quickly finding products, orders, customers, pages, settings and actions.
- Breadcrumbs, contextual actions, back navigation and sensible deep-linking.
- Consistent loading/skeleton, empty, error, retry, success and offline/network-failure states.
- Toasts/alerts for completed, failed and destructive actions, with confirmations for destructive operations.
- Form validation, inline errors, unsaved-change protection and draft/autosave where appropriate.
- Bulk selection and bulk actions where operationally useful.
- Import/export tools using safe validation, previews and error reports.
- Notifications center with read/unread state and relevant operational alerts.
- In-app help, onboarding, tooltips, guides and searchable documentation.
- User profile, preferences, locale, currency, timezone and notification settings.
- Secure sessions, logout-all-devices, account recovery and appropriate security events.
- Accessibility basics: keyboard navigation, focus states, labels, semantic controls, sensible contrast, reduced-motion consideration and mobile touch targets.
- Dark/light/system theme where supported.
- Localization-ready date, number, currency and language formatting.
- Audit/activity history for important merchant and admin actions.
- Rate limiting, abuse protection, validation and safe error handling on sensitive endpoints.
- Privacy, consent, cookie/storage controls where legally applicable, data export and deletion workflows where applicable.
- System health/error reporting hooks without exposing secrets or sensitive customer data.
- Reliable background-job patterns for email, imports, fulfillment updates, analytics aggregation and other asynchronous work.

## Full dropshipping platform feature set
Lunavo must combine the user's custom requirements with the major functional patterns expected from modern dropshipping platforms. These are product requirements, not permission to copy another company's branding or proprietary implementation.

### Dropshipping sourcing and product discovery
- Supplier/product URL import as the primary low-friction sourcing method.
- Import public product information where technically and legally possible: title, description, images, variants, SKU, price, availability, specifications and public attributes.
- Product discovery/search workspace for finding products and supplier links.
- Product research fields such as source URL, supplier name, source price, estimated shipping, destination, processing time, margin and risk notes.
- Save products to a sourcing list/wishlist before importing.
- Product import preview with field mapping and editable content before publication.
- Duplicate-product detection and merge/skip options.
- Image/media selection, ordering, cropping/optimization and alt text.
- Variant mapping and SKU generation.
- Cost, selling-price and margin calculator.
- Suggested pricing rules: fixed markup, percentage markup, rounding and min/max margin safeguards.
- Currency conversion for sourcing and selling calculations while preserving authoritative transaction/settlement currencies.
- Product compliance/risk flags and admin review queues.

### Supplier management
- Supplier directory/records without requiring a predefined supplier list.
- Supplier profiles, contact information, source URLs and notes.
- Supplier-product relationships.
- Supplier cost and availability tracking.
- Supplier performance metrics such as processing time, fulfillment reliability, cancellation rate and issue rate when real data exists.
- Multiple suppliers for the same product.
- Preferred supplier selection and fallback supplier rules.
- Supplier notes and internal tags.
- Supplier order/reference tracking.
- No requirement for merchant-entered supplier API keys merely to use URL ingestion.
- Where APIs are legally/technically available, adapters may be added as optional integrations rather than a core dependency.

### Product synchronization
- Detect relevant source-product changes where technically and legally possible.
- Merchant-controlled sync rules for price, stock, variants, images and descriptions.
- Per-field sync controls so merchant edits are not unexpectedly overwritten.
- Sync logs, timestamps and failure explanations.
- Price-change thresholds and stock safeguards.
- Low-stock/out-of-stock alerts.
- Optional automatic pause/unpublish rules when source availability disappears.
- Never silently overwrite merchant-controlled content without an enabled rule.

### Dropshipping order automation
- Customer order captured in Lunavo.
- Server-side order/payment verification before fulfillment processing.
- Split orders by supplier when necessary.
- Supplier purchase/order preparation workflow.
- Supplier cost calculation and order profitability tracking.
- Fulfillment status pipeline: pending, paid, awaiting supplier action, ordered, processing, shipped, delivered, cancelled, returned/refunded and exception states as appropriate.
- Supplier order/reference IDs.
- Tracking number and carrier capture.
- Tracking-event synchronization where supported.
- Customer-facing tracking page.
- Merchant fulfillment dashboard with filters and bulk actions.
- Manual fulfillment fallback when automation is unavailable.
- Prevent duplicate supplier orders using idempotency and authoritative state transitions.
- Return/refund workflow that distinguishes customer refund, supplier refund and merchant/platform financial effects.

### Shipping and delivery
- Shipping zones, methods and rates.
- Free-shipping thresholds.
- Flat-rate, table-rate and calculated shipping patterns where supported.
- Estimated delivery windows.
- Carrier/tracking information.
- Local pickup/delivery options where configured.
- Shipping labels/instructions where integrations support them.
- Address validation and structured customer addresses.
- International shipping support with country/region restrictions.
- Duties/taxes configuration where legally appropriate; do not present estimates as authoritative tax advice.

### Dropshipping pricing and profit controls
- Landed-cost view including product cost, estimated shipping, provider fees, platform fee and other configured costs.
- Gross revenue, gross profit, net revenue and margin reporting.
- Per-product and per-order profitability.
- Pricing rules and automatic repricing with merchant approval/control.
- Minimum margin protection.
- Currency-aware profit calculations.
- Cost-history tracking so merchants can see why margins changed.

### Customer-facing commerce essentials
- Product search and discovery.
- Categories, collections, filters and sorting.
- Product detail pages with variants, images, stock state, shipping information and policies.
- Cart and persistent cart where appropriate.
- Checkout with server-authoritative calculations.
- Discount/coupon/gift-card support where enabled.
- Customer accounts plus guest checkout where configured.
- Order history and tracking.
- Wishlist/favorites.
- Product reviews/ratings with moderation and anti-abuse controls.
- Store policies: shipping, returns, privacy, terms and contact information.
- Transactional email/notification workflows where configured.
- SEO-friendly storefront metadata, URLs, sitemap/robots support where applicable.

## Payments / TS Pay
TS Pay is Lunavo's first-party payment operating layer and internal source of truth. It is not itself a bank account and must never fabricate a money destination.

Payment architecture:
- Customer and merchant payment flows are initiated through Lunavo/TS Pay.
- Real payment destinations come from actual configured payment providers/rails.
- Flutterwave is the initial provider rail.
- Other rails may be adapters, including Paystack, Stripe and PayPal where later enabled.
- Track merchant/store, transaction, provider, settlement currency, transaction currency, provider fee, Lunavo fee, merchant net, refund/dispute status, payout state and reconciliation records.
- Verify payments server-side using provider webhooks and provider re-verification.
- Webhook authenticity must be checked.
- Never trust frontend payment-success claims.
- Use idempotency and duplicate-payment protection.
- Prevent overselling with server-authoritative inventory checks.
- Checkout calculations are server authoritative for products, variants, inventory, prices, discounts, taxes, shipping and fees.
- Merchant payouts are controlled by verified records and withdrawal requests.
- Store/customer/admin/payment codes are identifiers only and are never treated as bank accounts.

## Flutterwave integration
- Master Admin can configure the Flutterwave Secret API Key from Admin > Integrations.
- Validate supported secret-key prefixes and verify the credential before accepting it.
- Encrypt the credential at rest.
- Never return the secret key from status endpoints.
- Do not poison a working runtime credential when a replacement credential fails verification or persistence.
- Detect test/live mode from the verified key prefix.
- Keep checkout initialization, transaction verification, refunds, virtual-account support and reconciliation server-side.

## Marketplace
- Optional central marketplace.
- Merchant marketplace fee: $5/month plus $5 per listed product, in addition to the $30/month merchant subscription and 1% sale transaction fee.
- Most listings can be automatically approved after required payment/validation.
- Flagged or risky products go to admin review.
- Merchant verification at signup; full verification before payouts.
- Manual merchant withdrawal requests are reviewed through the merchant/admin workflow.

## Subscription and referral
- Merchant subscription: $30/month.
- No free trial and no promotional pricing.
- Subscription includes unlimited stores and standard features.
- After a merchant successfully pays the $30 subscription, generate a unique referral code for that paid subscription month.
- The referral code expires at the end of that applicable paid referral period and a new code is generated/activated for the next paid month.
- If a referred new merchant signs up using a valid referral code and successfully pays their first $30 subscription, the referring merchant receives 30% off their next monthly subscription.
- Referral rewards must be calculated from authoritative successful payment records.

## Marketing and growth essentials
- Email/SMS/push-ready campaign architecture with provider adapters where required.
- Campaigns, audiences/segments, coupons, discounts and promotions.
- Abandoned-cart recovery hooks.
- Product recommendations and related-product merchandising.
- Social/share metadata.
- Referral/affiliate-ready tracking architecture.
- Advertising campaign management and budget tracking without fabricating spend or conversion results.
- SEO controls for storefronts and products.
- Analytics for traffic, conversion, sales, customers, products and campaigns.

## Admin control room
The Master Admin dashboard must provide operational control over:
- executive overview
- merchants and stores
- customers
- marketplace listings and moderation
- subscriptions
- payments and provider integrations
- platform finance
- merchant payouts/withdrawals
- refunds/disputes
- advertising/campaign payment review
- support and activity
- platform settings
- security/audit controls
- merchant preview/switching without compromising tenant isolation
- supplier/product risk and abuse controls
- platform-wide feature flags and operational configuration where safely implemented.

## Frontend rebuild standard
The frontend must be rebuilt as a coherent product, not a collection of unrelated pages.
- Responsive mobile, tablet and desktop layouts.
- Consistent spacing, typography, cards, tables, forms, buttons, badges, empty states and loading states.
- Clear information hierarchy.
- Short, useful navigation labels.
- Group related functions rather than presenting a long unstructured menu.
- Preserve every existing route and capability.
- Public storefront/customer experience and merchant/admin experience must feel like parts of one product.
- Avoid excessive decorative elements, random colors, oversized headings, unnecessary borders and inconsistent card styles.
- Accessibility: keyboard navigation, visible focus, labels, sensible contrast, semantic buttons/links and mobile touch targets.
- Dark/light mode must remain supported.
- Every major feature should have a usable first-run state, empty state, loading state, error state and success state.

## Factory-reset meaning for this rebuild
A frontend/product factory reset means rebuilding the application cleanly from the GitHub source and this specification while retaining the required feature set and security architecture.
It must NOT mean blindly deleting production database records, credentials, payment history, merchant records or audit logs.
Any destructive data reset must be an explicit, separately reviewed server/database operation with backups and confirmation.
