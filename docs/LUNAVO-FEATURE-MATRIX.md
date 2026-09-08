# Lunavo — Connected Commerce Feature Matrix

Lunavo is treated as one commerce operating system. A feature is not considered complete merely because a page exists: it must consume and emit the correct domain data/events and use the shared services.

## Core commerce
- Multi-tenant merchant accounts and unlimited stores
- Store builder, themes, navigation, pages, sections, blocks and reusable templates
- Products, variants, bundles, kits, digital products, courses, memberships, services, bookings, appointments, events and tickets
- Collections, categories, tags, attributes, custom fields and product relationships
- Product URL import, bulk import, supplier catalog import and guided mapping
- Duplicate detection, SKU generation, variant normalization and catalog cleanup
- Product reviews, ratings, Q&A, wishlists, compare, recently viewed and saved carts
- Search, autocomplete, filters, sorting, recommendations and personalized merchandising
- Guest checkout, customer accounts, one-page checkout, saved addresses and order history
- Abandoned-cart recovery, back-in-stock alerts and price-drop alerts

## Dropshipping
- Supplier/product URL ingestion without merchant supplier API keys
- Supplier discovery and comparison
- Supplier reliability, cost, shipping-time and exception scoring
- Product opportunity research and trend scoring
- Competition/saturation analysis
- Landed-cost and true-margin calculation
- Safe price, break-even and minimum-margin recommendations
- Order-to-supplier queue
- Supplier fulfillment tracking
- Tracking synchronization
- Partial/split shipments
- Failed fulfillment and exception center
- Returns/RMA and supplier refund tracking
- Automatic customer fulfillment notifications

## Inventory
- Multi-store inventory
- SKU/variant stock
- Reservations and allocations
- Purchase/restock workflows
- Stock adjustments and audit trail
- Low-stock thresholds
- Demand forecasting
- Stockout prediction
- Overstock detection
- Supplier lead-time intelligence

## TS Pay and finance
- TS Pay first-party payment operating layer
- Payment intents and checkout sessions
- Payment links and invoices
- Unified internal ledger
- Provider references and idempotency
- Webhook authenticity checks and provider re-verification
- Refunds and disputes
- Reconciliation
- Merchant balances
- Manual payout requests
- Provider fees, TS Commerce 1% fee and marketplace fees tracked separately
- Gross sale, discount, tax, shipping, provider fee and merchant-net accounting
- Transaction currency and settlement currency tracked separately
- Flutterwave as initial money rail; additional rails remain adapters
- Subscription billing and monthly referral-code lifecycle
- AI has no authority to move money or fabricate financial state

## Customers / CRM
- Unified customer profile
- Customer timeline
- Orders and lifetime value
- Segmentation
- Customer notes and tags
- Churn-risk scoring
- Win-back workflows
- Loyalty
- Gift cards
- Referral/affiliate programs
- Customer notifications and preferences

## Marketing
- Campaigns
- Segments
- Email marketing
- Lifecycle automation
- Abandoned-cart recovery
- Post-purchase flows
- Win-back campaigns
- Upsell/cross-sell
- Bundles and quantity breaks
- Buy-one-get-one
- Free-shipping thresholds
- Countdown and exit-intent campaigns
- A/B experiments
- Attribution and campaign analytics

## Creative AI
- Local product-image generation
- Lifestyle scenes
- Background generation/removal
- Inpainting/outpainting
- Upscaling
- Image variations
- Brand-consistent generation
- Static ads
- Video ads
- Voice-over/audio generation
- Captions/subtitles
- Aspect-ratio adaptation
- Creative templates
- A/B creative variants
- Product-aware ad generation
- Creative performance feedback loop

## Analytics and intelligence
- Unified commerce event stream
- Sales analytics
- Product analytics
- Conversion analytics
- Customer analytics
- Inventory analytics
- Fulfillment analytics
- Marketing analytics
- Finance analytics
- Revenue/margin forecasting
- Demand forecasting
- Anomaly detection
- Business-health monitoring
- Next-best-action recommendations
- Scenario simulation
- Scheduled intelligence reports

## Automation
- Event-driven workflow engine
- Scheduled workflows
- Retries and dead-letter handling
- Conditional branches
- Human approvals
- Audit trail
- Merchant-created automations
- AI-prepared workflows
- Autonomous merchandising with configurable limits
- Supplier/order exception automations
- Marketing automations

## Marketplace
- Optional merchant marketplace participation
- Merchant approval/moderation
- Listing fees
- Marketplace product listings linked to canonical merchant products
- Shared inventory state
- Marketplace search and discovery
- Marketplace order linkage
- Marketplace fee accounting
- Seller analytics
- Auctions and auction management

## Services and commerce expansion
- POS
- Services
- Bookings
- Appointments
- Events/tickets
- Subscriptions
- Courses
- Memberships
- Digital downloads
- Invoicing
- Payment links
- Customer portals

## Administration and security
- Master Admin
- Merchant administration
- Role-based permissions
- Tenant isolation
- 2FA
- Login alerts
- Device/session management
- Suspicious-login detection
- Rate limiting and brute-force protection
- Secure password hashing/recovery
- Session revocation
- Audit logs
- Data export and deletion controls
- Feature/configuration controls
- Health and job monitoring

## Developer platform
- Merchant API keys
- Scoped permissions
- Key rotation/revocation
- Webhook secrets
- Event webhooks
- API usage logs
- Rate limits
- Developer documentation
- Idempotency
- Background jobs
- Internal service contracts

## Self-hosting
- Local AI runtime adapter
- Local LLM inference
- Local embeddings/vector search
- Local OCR/document processing
- Local image generation
- Local audio/video tooling
- Self-hosted object storage
- Self-hosted SMTP/mail infrastructure
- Self-hosted search/indexing where required
- Self-hosted workflow/job infrastructure
- No hosted AI provider required for core operation
- External money providers are adapters only

## New capabilities added in the rebuild
- Unified capability registry
- Shared domain-event vocabulary
- Cross-module next-best-action engine
- Business-health monitoring
- Supplier reliability intelligence
- Product opportunity scoring
- True landed-cost intelligence
- Stockout/overstock prediction
- Personalized merchandising
- Creative performance feedback loop
- Approval center for high-impact automation
- Connected Academy/Guide using merchant context
- Stable event API for integrations

## Definition of done
Every capability must:
1. Use shared tenant-aware domain services.
2. Persist canonical state once instead of duplicating it in feature silos.
3. Emit relevant domain events.
4. Subscribe to events needed by downstream modules.
5. Respect permissions and tenant isolation.
6. Use local/self-hosted infrastructure unless an external money rail is required.
7. Never let AI invent payment, balance, settlement or payout state.
8. Have loading, empty, error, retry and audit states.
9. Be observable through logs/metrics/job status.
10. Be testable independently and through end-to-end workflows.
