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
- Every feature must be designed to feel exceptionally polished, useful, fast, coherent and production-ready. "Banger/fire" quality means strong UX, complete workflows, thoughtful defaults, excellent states, responsive performance and real functionality rather than decorative mockups.

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

## Autopilot — autonomous store/business operator
Lunavo must include a powerful optional **Autopilot** that can operate a merchant's store/business continuously within explicit permissions, budgets, safety rules and approval settings. It is an assistant/operator, not an uncontrolled agent.

### Autopilot control center
- Dedicated Autopilot dashboard showing status, goals, tasks completed, recommendations, actions taken, money spent, revenue attributed where measurable, errors, pending approvals and activity timeline.
- Modes: Off, Assist, Approval Required and Full Autopilot.
- Merchant-defined goals such as increase sales, improve conversion, clear inventory, grow traffic, maintain margins, promote selected products or reduce operational workload.
- Merchant-defined limits for advertising spend, discount depth, price changes, supplier ordering, refunds, communications and other financially consequential actions.
- Product/store/category exclusions and protected items that Autopilot cannot modify.
- Approval queues for actions requiring human confirmation.
- Full action log with who/what/when/why, inputs, result and rollback capability where technically possible.
- Emergency stop/pause-all automation control.
- Dry-run and preview mode before autonomous execution.
- Scheduled operating windows and quiet hours.
- Per-feature permissions so merchants can allow some automations while blocking others.

### Autopilot store operations
When enabled and permitted, Autopilot can:
- Monitor store health, sales, conversion, inventory, product availability, supplier changes, fulfillment exceptions, customer issues and campaign performance.
- Detect operational problems and propose or execute permitted fixes.
- Create/edit product drafts, descriptions, SEO metadata, collections and merchandising arrangements.
- Organize products into categories/collections based on merchant rules.
- Identify weak products, dead stock, low-stock products and opportunities for promotion.
- Recommend pricing and margin improvements within merchant-defined boundaries.
- Monitor supplier price/stock changes and trigger configured sync/pause/repricing workflows.
- Prepare or execute supplier fulfillment workflows where authorized.
- Monitor orders and flag exceptions, late fulfillment, tracking problems and customer-impacting issues.
- Prepare customer-service responses using approved policies and escalate sensitive cases to the merchant.
- Generate reports and explain what changed and why.

### Autopilot advertising and marketing
- Generate advertising concepts, copy, headlines, descriptions, calls to action and creative variations from real store/product data.
- Generate or request approved visual creatives and adapt them for supported placements.
- Build campaigns from merchant-selected products, audiences, objectives and budgets.
- Create campaign drafts and, where the merchant has explicitly authorized it and the advertising integration supports it, publish campaigns through official platform APIs/integrations.
- Schedule, pause and optimize campaigns according to merchant-defined budget and performance rules.
- Generate multiple creative variants and test them where supported.
- Monitor spend, impressions, clicks, conversions and attributed revenue only from authoritative platform data.
- Shift budget between campaigns within explicit merchant limits.
- Detect poor-performing creatives and recommend/pause them according to configured rules.
- Never claim an ad was published if an external platform did not confirm publication.
- Never fabricate ad spend, reach, clicks or conversions.

### Autopilot social/content publishing
- Generate product posts, promotional posts, educational content, captions and content calendars.
- Adapt content to supported social channels while respecting each channel's rules and API capabilities.
- Draft, schedule and, where officially supported and authorized, publish posts through real integrations.
- Maintain a content calendar and publishing history.
- Track confirmed publication status and errors.
- Never pretend to post to a platform without a successful provider response.

### Autopilot customer growth
- Detect abandoned carts and trigger approved recovery workflows.
- Create customer segments based on real purchase/engagement data.
- Recommend upsells, cross-sells and related products.
- Suggest or execute eligible promotions within merchant rules.
- Identify repeat customers, high-value customers and customers at risk of churn.
- Generate personalized but policy-compliant customer communications.
- Respect opt-outs, communication permissions and applicable privacy/marketing requirements.

### Autopilot analytics and decision-making
- Continuously analyze real store metrics.
- Explain changes in revenue, conversion, average order value, margins, inventory and campaign performance.
- Detect anomalies and notify the merchant.
- Recommend prioritized actions with estimated impact where defensible.
- Learn from merchant-approved decisions without silently changing critical business rules.
- Provide daily/weekly business briefings.
- Maintain an auditable reason for consequential automated actions.

### Autopilot safety and financial controls
- No autonomous action may bypass authentication, authorization, payment verification, inventory controls, fraud checks, privacy permissions or platform policy.
- Never invent money, payment confirmations, customers, reviews, ad metrics or sales.
- Financially consequential actions require explicit configurable limits and, where appropriate, approval.
- Advertising spend must remain within configured budgets.
- Supplier purchases must remain within configured purchasing limits.
- Price changes must respect minimum margin and maximum-change rules.
- Discounts must respect minimum price/margin floors.
- Refunds, account changes and sensitive customer communications can require approval.
- Secrets, payment credentials and private keys are never exposed to the AI model or client UI unnecessarily.
- All automated actions must be attributable, logged and reviewable.

## Advanced commerce capability catalogue
Lunavo should continue to include the major capabilities expected of a serious all-in-one commerce operating system, including:

### CRM and customer intelligence
- Unified customer profiles with orders, lifetime value, refunds, interactions, consent and notes.
- Customer segmentation, tags, cohorts and saved audiences.
- Customer timeline and internal activity history.
- Customer import/export and duplicate merging.
- Saved searches and operational customer views.
- Customer groups, VIP tiers and account-specific pricing.
- Churn-risk and retention signals based on real data.
- Consent and communication-preference management.

### Advanced catalog and merchandising
- Product options, variants, bundles, kits and related products.
- Collections, smart collections and manual merchandising.
- Product badges, labels and promotional pricing windows.
- Bulk product editing.
- Product templates and reusable field sets.
- SKU/barcode/GTIN support.
- Product metafields/custom attributes.
- Draft, scheduled, active, archived and unpublished states.
- Catalog import/export with validation and error reports.
- Product-level SEO, structured metadata and canonical URL controls.
- Product comparison and merchandising rules.

### Checkout and conversion
- Server-authoritative cart and checkout calculations.
- Guest and account checkout.
- Saved addresses and customer checkout preferences.
- Coupon, discount, gift-card and store-credit logic where enabled.
- Shipping/tax/fee calculation before payment.
- Checkout recovery and abandoned-cart workflows.
- Idempotent order creation and duplicate-submission protection.
- Inventory reservation/oversell prevention.
- Order notes and delivery instructions.
- Checkout analytics and conversion-funnel reporting.

### Promotions, loyalty and retention
- Coupon codes, automatic discounts and promotion rules.
- Buy-X-get-Y and quantity-break patterns.
- Gift cards and store credit with proper ledger accounting.
- Loyalty points and rewards.
- Referral and affiliate tracking.
- Customer-specific offers.
- Promotion scheduling and eligibility rules.
- Promotion usage limits and abuse controls.

### Reviews and user-generated content
- Verified-purchase review signals where order data supports them.
- Ratings, review text, media and moderation queues.
- Merchant replies.
- Report/flag abuse.
- Spam/rating-manipulation controls.
- Review request campaigns subject to consent and applicable rules.

### Support and communications
- Customer support inbox/helpdesk architecture.
- Tickets, statuses, priorities, assignments and internal notes.
- Order-aware customer support context.
- Saved replies and response templates.
- Email notification templates.
- Transactional versus marketing communication separation.
- Provider adapters for email/SMS/push where required.
- Delivery status and failure handling.
- Notification preference center.

### Workflow automation engine
- Event-trigger-condition-action automation framework.
- Triggers for orders, payments, inventory, customers, products, supplier changes, campaigns and schedules.
- Conditions, branching and delays.
- Actions such as notifications, tags, status updates, drafts and integrations.
- Retry and failure handling.
- Idempotency and job history.
- Human approval checkpoints.
- Automation templates and reusable recipes.
- Per-store enable/disable controls.

### Subscriptions and recurring revenue
- Subscription products and plans.
- Billing schedules and renewal states.
- Failed-payment handling/dunning hooks.
- Cancellation, pause and resume workflows.
- Upgrade/downgrade/proration-ready architecture.
- Subscription invoices and payment history.
- Customer self-service subscription management where configured.

### Digital products, courses and memberships
- Secure digital-file delivery.
- Download limits/expiration where configured.
- Course modules, lessons and completion tracking.
- Membership tiers and gated content.
- Access grants/revocation based on authoritative subscription/payment state.
- Certificates/completion records where enabled.

### Services, appointments and bookings
- Service catalog.
- Staff/provider calendars.
- Availability rules and blackout dates.
- Appointment booking, rescheduling and cancellation.
- Resources/rooms/equipment allocation.
- Time zones and localized scheduling.
- Booking confirmations/reminders.
- Deposits and payment-state integration.
- No-double-booking protection.

### B2B and wholesale
- Business customer accounts.
- Wholesale catalogs and price lists.
- Quantity breaks and negotiated pricing.
- Purchase orders and payment terms where enabled.
- Tax/business identity fields.
- Approval workflows.
- Sales-rep/team access.
- Customer-specific catalogs and visibility rules.

### Purchasing and supplier operations
- Purchase orders.
- Supplier bills/cost records.
- Receiving and partial receiving.
- Supplier return workflows.
- Cost history and landed-cost allocation.
- Supplier scorecards based only on real recorded performance.

### Warehouse and inventory operations
- Multi-location inventory.
- Warehouse bins/locations.
- Stock transfers.
- Stock reservations.
- Cycle counts and adjustments with audit trails.
- Barcode/QR workflows.
- Pick/pack/ship workflows.
- Low-stock/reorder rules.
- Inventory valuation-ready records.
- Lot/batch/serial tracking architecture where applicable.

### Returns and after-sales
- Return/RMA requests.
- Eligibility rules.
- Return reasons and inspection status.
- Refund/exchange/store-credit choices.
- Supplier-return tracking for dropship orders.
- Return shipping tracking.
- Full financial distinction between customer refund, supplier refund and merchant/platform effects.

### Finance and accounting readiness
- Transaction ledger.
- Merchant balance and available/pending states.
- Fees, refunds, disputes and adjustments.
- Payout requests and payout history.
- Reconciliation workflows.
- Financial period reporting.
- CSV/accounting export readiness.
- Revenue, fees, refunds, taxes and cost reporting.
- Never represent internal ledger balances as bank balances unless backed by actual provider/account records.

### POS and omnichannel
- Retail POS checkout.
- Barcode scanning readiness.
- Cash/card/approved payment methods.
- Receipts and refunds.
- Register/session management.
- Staff permissions.
- Offline-safe draft transaction handling where technically appropriate, with later authoritative synchronization.
- Unified online/offline customer and inventory records.

### Marketplace and auctions expansion
- Seller onboarding and verification states.
- Listing quality checks.
- Marketplace search, categories and ranking signals.
- Seller analytics.
- Listing fees and sale fees using authoritative records.
- Auction start/end times, bid increments, reserves and bid history.
- Winner/payment/fulfillment states.
- Anti-abuse and bid-integrity controls.

### Content, CMS and SEO
- Store pages and reusable sections.
- Blog/article content.
- Navigation/menu management.
- Redirect management.
- SEO title/description/OG metadata.
- Sitemap and robots controls.
- Structured data readiness.
- Image optimization and alt text.
- Draft/publish/schedule workflow.

### Domains and storefront infrastructure
- Lunavo subdomain provisioning architecture.
- Custom-domain connection workflow.
- Domain verification and DNS guidance.
- SSL status/readiness.
- Store email/domain settings readiness.
- White-label storefront option where enabled.

### Analytics, BI and experimentation
- Real-time/recent operational dashboards where data freshness permits.
- Sales, conversion, AOV, margin, retention and cohort analytics.
- Product and category performance.
- Customer and geographic analytics.
- Marketing attribution where source data supports it.
- Funnel analysis.
- Scheduled reports.
- Exportable reports.
- Anomaly detection.
- Goal/KPI tracking.
- A/B testing/experimentation architecture with statistically responsible reporting and no fabricated uplift.

### Search and recommendations
- Fast catalog search.
- Filters/facets and sorting.
- Typo-tolerant search readiness.
- Synonyms and merchandising rules.
- Related products.
- Frequently bought together.
- Recently viewed.
- Personalized recommendations only when supported by real behavioral data and privacy settings.

### Internationalization
- Multiple countries and currencies.
- Transaction currency versus settlement currency separation.
- Locale-aware number/date/address formatting.
- Time-zone-aware scheduling.
- Multi-language-ready storefront/content architecture.
- Country-specific availability/shipping rules.
- Currency conversion with source/rate timestamps where external rates are used.

### Developer ecosystem
- Versioned REST/API-ready architecture.
- Webhooks with signing, replay protection and event logs.
- API keys/tokens with scoped permissions and rotation.
- OAuth/integration readiness.
- App/integration registry architecture.
- Import/export APIs.
- Rate limits and usage visibility.
- Developer documentation readiness.

### Reliability and observability
- Structured server logs without secrets.
- Error tracking hooks.
- Health/readiness checks.
- Background-job monitoring.
- Retry/backoff/dead-letter patterns where appropriate.
- Idempotency for external side effects.
- Database migration discipline.
- Backup/restore planning.
- Incident/audit trail.
- Feature flags and safe rollout controls.

### Security, privacy and trust
- Tenant isolation at every data-access layer.
- Least-privilege permissions.
- Secure secret storage.
- CSRF/XSS/injection-safe patterns appropriate to the stack.
- Input validation and output encoding.
- Rate limiting and abuse controls.
- Login/security-event auditing.
- Data export/deletion workflows.
- Consent and communication preferences.
- Sensitive-action confirmation and step-up authentication where appropriate.
- No secrets in logs, URLs or client bundles.

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
