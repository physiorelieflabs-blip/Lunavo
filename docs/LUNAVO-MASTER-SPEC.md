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

## Identity and access
- Product name: Lunavo.
- Master Admin email: ifeoluwaolowu4@gmail.com.
- Master Admin display/username: TSAdmin from the established admin setup.
- The admin password is the password the owner sets in the configured authentication provider. Never hardcode, generate, expose or replace it in source code.
- Master Admin access requires the authenticated account to match the approved email and be verified.
- Admin security must include strong authentication, 2FA support where configured, login alerts, session/device controls, suspicious-login detection and audit logging.
- Merchants have isolated workspaces/dashboards. The platform has a separate master-admin control room.

## Platform scope
Lunavo is a global commerce platform combining merchant SaaS, independent storefronts, marketplace, payments, logistics, marketing, AI assistance, POS and integrations.

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

## Factory-reset meaning for this rebuild
A frontend/product factory reset means rebuilding the application cleanly from the GitHub source and this specification while retaining the required feature set and security architecture.
It must NOT mean blindly deleting production database records, credentials, payment history, merchant records or audit logs.
Any destructive data reset must be an explicit, separately reviewed server/database operation with backups and confirmation.
