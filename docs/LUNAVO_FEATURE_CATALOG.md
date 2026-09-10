# Lunavo — Complete Feature Catalog

This is the canonical rebuild checklist. A feature is not considered complete merely because a route, button, or placeholder exists: it must have working UI, server authorization, persistence, validation, error handling, tests, and real provider integration where applicable.

## 1. Platform & accounts
- Global multi-merchant commerce SaaS
- Multi-vendor architecture
- Merchant workspaces / stores
- Multiple stores per merchant
- Unlimited stores under the core $30/month subscription
- Customer accounts
- Merchant accounts
- Separate master-admin workspace
- Role-based access control
- Staff accounts
- Team memberships
- Location-scoped staff access
- Workspace switching
- Customer/merchant role switching
- Clerk authentication
- Sign in / sign up
- Password reset
- Verified email enforcement where required
- Master-admin authorization
- Session/cache isolation between users
- Account activity/audit history
- Secure account settings

## 2. Merchant subscription & billing
- $30/month core merchant subscription
- No free trial
- No promotional pricing
- Subscription payment from dashboard earnings
- If earnings are below $30, carry outstanding amount forward
- If earnings exceed $30, deduct exactly $30
- Subscription currency selection
- Provider-backed subscription payment
- Server-side payment verification
- Subscription access control
- 15-day earning/access window semantics
- Billing history
- Subscription status
- Failed-payment recovery
- Renewal handling
- Referral-code generation after successful $30 payment
- Referral code scoped to its paid subscription period
- Referral-code expiry
- New code for each paid month
- Referrer gets 30% off next $30 subscription ($9 discount / $21 payable)
- Referred merchant does not receive the discount
- Anti-self-referral / anti-collusion controls

## 3. Stores & storefronts
- Store creation
- Store settings
- Store name / branding
- Store logo / media
- Public storefront
- Merchant storefront preview
- Store subdomain support
- Custom-domain support
- Removable Lunavo branding where permitted
- Responsive mobile/desktop storefront
- Product search
- Product categories
- Product detail pages
- Product variants
- Product media galleries
- Product specifications
- Store policies
- Store contact information
- Store navigation
- Store SEO metadata
- Public store sharing
- Store-level customer checkout
- Linked-bank direct-transfer destination where supported
- Unverified transfer evidence awaiting merchant approval

## 4. Product catalog
- Physical products
- Digital products
- Courses
- Memberships
- Services
- Bookings
- Events
- Tickets
- Subscriptions
- Product creation/editing/deletion
- Draft/published/archive states
- SKU management
- Variant management
- Product categories
- Product tags
- Product descriptions
- Product images
- Product files for digital goods
- Product pricing
- Compare-at pricing
- Selling-price validation
- Supplier-cost separation
- Merchant selling price is the only shopper-facing charge
- Product import
- Bulk catalog operations
- Catalog search/filter/sort

## 5. Store builder
- Store templates
- Visual store builder
- Drag-and-drop layout editing
- Sections/components
- Theme settings
- Typography controls
- Navigation configuration
- Homepage configuration
- Product-page configuration
- Collection/category pages
- Custom HTML/CSS where safely permitted
- Preview mode
- Publish workflow
- Mobile preview
- Branding controls

## 6. Checkout & orders
- Public checkout
- Cart
- Checkout pricing calculation
- Server-calculated taxes
- Server-calculated shipping
- Immutable pricing/tax/shipping snapshots
- Discount handling
- Order creation in pending state
- Payment selection
- Payment references
- Payment verification
- Successful-sale transition
- Order status lifecycle
- Order details
- Customer order history
- Merchant order management
- Order search/filter
- Order cancellation
- Refunds
- Partial refunds
- Disputes
- Chargebacks
- Reversals
- Provider refund claiming before local accounting
- Failed-payment recovery
- Hosted payment-return recovery
- Provider transaction identifiers retained until verification succeeds
- Idempotent order/payment operations
- Invoice generation from orders

## 7. TS Pay / Lunavo Pay payment orchestration
- First-party payment/orchestration layer
- Internal ledger as accounting source of truth
- Provider adapters rather than pretending to be a bank
- Flutterwave adapter
- Paystack adapter architecture
- Stripe adapter architecture
- PayPal adapter architecture
- Provider checkout initiation
- Provider webhook ingestion
- Provider transaction verification
- Provider settlement reconciliation
- Transaction-currency vs settlement-currency separation
- Provider-fee accounting
- Lunavo 1% transaction fee
- Merchant-net calculation
- Refund accounting
- Dispute accounting
- Chargeback accounting
- Reserves
- Payout routing
- Payout reconciliation
- Payment risk controls
- Exact amount verification
- Exact currency verification
- Exact reference verification
- Merchant/order binding verification
- Idempotency keys
- Duplicate webhook protection
- Internal ledger double-entry accounting
- Same-currency internal transfers only
- Locked internal transfers
- Merchant-scoped transfer idempotency
- Real regulated payout rail boundary
- No fake balances
- No fake bank accounts
- No frontend payment-success authority

## 8. Flutterwave
- Secure server-side secret configuration
- Webhook hash verification
- Hosted checkout
- Bank-transfer/virtual-account destinations when provider returns them
- Real provider account/name/bank/account/reference/amount/expiry display
- Transaction verification
- Webhook idempotency
- Pending-transaction reconciliation
- Provider refund flow
- Provider settlement reconciliation
- Provider fee capture
- Provider failure handling

## 9. Merchant wallets, withdrawals & finance
- Merchant internal earnings ledger
- Available earnings
- Pending earnings
- Earning-window enforcement
- Withdrawal requests
- Withdrawal status lifecycle
- Manual withdrawal review
- Payout audit trail
- Merchant payout PIN #1
- Merchant payout PIN #2
- Hashed PIN storage only
- Step-up verification
- Admin payout review controls
- Admin five-factor/PIN security boundary as configured
- Authenticator step-up for sensitive admin payout actions
- Finance dashboard
- Revenue reporting
- Fees reporting
- Provider-fee reporting
- Refund reporting
- Net earnings reporting
- Reconciliation views
- Ledger entries
- Accounting event history

## 10. Marketplace
- Central marketplace
- Merchant marketplace enrollment
- Optional marketplace fee of $5/month
- $5 per listed product
- Marketplace product listing
- Listing payment verification
- Listing approval workflow
- Automatic approval for normal low-risk listings after payment
- Risk-flagged listing review
- Marketplace search
- Marketplace categories
- Marketplace product pages
- Seller/merchant attribution
- Marketplace orders
- Marketplace advertising compatibility
- Marketplace seller management

## 11. Auctions
- Auction creation
- Auction management
- Auction product pages
- Bidding
- Bid validation
- Bid history
- Auction status lifecycle
- Winner determination
- Auction checkout
- Auction customer experience
- Auction management dashboard
- Anti-manipulation controls
- Authenticated bidding

## 12. Inventory & warehouses
- Manual stock quantities
- Product stock levels
- Stock reservations
- Checkout inventory holds
- Verified-sale stock decrement
- Cancellation/release of reservations
- Warehouses
- Warehouse locations
- Inventory transfers
- Inventory adjustments
- Inventory history
- Multi-location inventory
- Location-scoped stock
- Source-based supplier stock as non-authoritative
- Inventory reconciliation
- Low-stock monitoring
- Inventory search/filter
- Stock movement audit trail

## 13. Suppliers & sourcing
- Dedicated **Sourcing** page
- Supplier catalog sourcing
- Supplier URL-only import
- No supplier API key requirement
- Supplier product fetch
- Safe public DNS validation/pinning
- SSRF protection
- Rejection of unsafe/private-network destinations
- Rejection of unsupported financial data
- AI title suggestions
- AI description suggestions
- AI category suggestions
- AI pricing suggestions
- AI variant extraction
- AI SKU extraction
- AI image extraction
- AI specification extraction
- AI shipping-information extraction
- Supplier source cost preservation
- Merchant selling-price separation
- Import review before publishing
- Live FX feed for currency conversion
- No fixed stale exchange-rate tables
- Research citations/limitations

## 14. Fulfillment & dropshipping
- Fulfillment management
- Supplier fulfillment records
- Dropshipping workflow
- Order-to-supplier workflow
- Fulfillment statuses
- Shipment/tracking information
- Customer-facing fulfillment status
- Merchant fulfillment dashboard
- Supplier/source attribution
- Inventory boundary between source stock and authoritative merchant stock

## 15. AI Control Room
- General Lunavo AI assistant
- DeepSeek-primary reasoning architecture
- Store assistant
- Product assistant
- Catalog assistance
- Order/customer assistance within authorization boundaries
- AI action confirmation boundaries
- No unauthorized money/stock mutations
- Public-shopper AI
- Shopper AI restricted to public storefront context
- Shopper AI cannot mutate orders/payments/stock/merchant data
- AI error/fallback handling
- AI usage controls

## 16. AI sourcing & product intelligence
- Gemini-backed research when configured
- Supplier-link research
- Web/social research
- Source citations
- Research limitations
- Product/image understanding
- DeepSeek + Gemini architecture
- Structured extraction
- Human review before authoritative publishing

## 17. AI image generation
- Pollinations image-generation integration
- Prompt entry
- Generated-image preview
- Save generated image
- Export generated image
- Merchant prompt preservation
- Image byte validation
- Safe fallback when provider unavailable
- Generation rate limits

## 18. Ad Studio
- Self-hosted Ad Studio
- Catalog-grounded ad planning
- Deterministic local ad planner
- Optional Gemini planning
- Creative prompt generation
- Catalog fact grounding
- Clear separation of creative prompts from factual proof
- Individual-product ad generation
- Store-wide ad generation
- Media upload
- Media validation
- Image/video assets
- FFmpeg video rendering
- Long-form video stitching
- Audio-safe stitching
- Guaranteed audio bed for stitched output
- Generated-media persistence
- Ad previews
- Ad export
- Ad generation rate limiting

## 19. Marketing
- Marketing dashboard
- Campaign concepts
- Product promotion
- Ad Studio integration
- Social publishing architecture
- Marketing activity tracking
- Campaign performance reporting

## 20. Social Hub
- Social account connection architecture
- Instagram connection
- Facebook connection
- TikTok connection
- YouTube connection
- LinkedIn connection
- Pinterest connection
- X architecture with PKCE requirement
- OAuth state protection
- OAuth nonce/timestamp validation
- AES-256-GCM token encryption
- Encrypted token persistence
- Provider-scoped credentials
- Publish-job queue architecture
- Idempotent publishing jobs
- Provider publishing adapters
- Publishing status/error reporting
- No claim of live publishing until provider adapter is genuinely implemented

## 21. POS
- Lunavo POS
- Product lookup
- Cart/line items
- Customer selection
- Checkout/payment boundary
- Receipt/order creation
- Inventory reservation semantics
- Verified-payment sale accounting
- POS activity
- Location-aware POS
- Staff authorization

## 22. Customers
- Customer records
- Customer profiles
- Customer search
- Customer order history
- Customer activity
- Customer communication context
- Customer segmentation foundation
- Customer/store relationship boundaries
- Merchant-scoped customer data
- Admin authorization boundaries

## 23. Invoices
- Invoice creation
- Invoice numbering
- Invoice line items
- Tax/shipping snapshots
- Invoice status
- Public invoice links/tokens
- Invoice payment
- Payment evidence
- Locked/idempotent payment verification
- Ledger posting after verification
- Invoice history

## 24. Payment links
- Payment-link creation
- Public payment-link checkout
- Tokenized payment URLs
- Server-side amount/reference validation
- Provider verification
- Idempotency
- Payment status

## 25. Team & locations
- Team members
- Invitations
- Workspace memberships
- Staff roles
- Locations
- Location assignments
- Server-side tenant resolution
- Server-side location scope validation
- Fail-closed unmapped staff routes
- Permission management
- Activity/audit visibility

## 26. Media library
- Merchant media library
- Uploads
- Durable tenant ownership
- Byte validation
- Size limits
- Format validation
- App Storage integration when provisioned
- No browser-only authoritative media storage
- Product media association
- Ad media association
- Generated media association

## 27. Analytics & reporting
- Merchant analytics
- Sales overview
- Revenue metrics
- Order metrics
- Customer metrics
- Product metrics
- Inventory metrics
- Marketing/ad metrics
- Finance reporting
- Time-range filters
- Currency-aware reporting
- Historical-money integrity
- Admin platform reporting

## 28. General Store / shopper experience
- General Store
- Marketplace browsing
- Product discovery
- Search
- Categories
- Product details
- Customer account
- Shopping cart
- Checkout
- Payment return handling
- Order context
- Public invoices
- Customer leaderboard where applicable
- Shopper AI

## 29. Admin / operations
- Master Admin dashboard
- Merchant management
- Merchant search/filter
- Merchant account inspection
- Merchant workspace preview
- Withdrawal review
- Finance oversight
- Payment oversight
- Reconciliation oversight
- Marketplace oversight
- Listing-risk review
- Integration management
- Platform activity
- Security controls
- Admin audit trail
- Admin ledger anchor separate from merchant membership
- No privilege escalation through merchant workspace membership

## 30. Security & trust boundaries
- Tenant isolation
- Server-side authorization
- RBAC
- Staff scope validation
- Clerk authentication
- Secure sessions
- CSRF protection where applicable
- CORS restrictions
- SSRF protection
- XSS-safe rendering
- Injection-safe queries
- Input validation
- Output validation
- Rate limiting
- Webhook verification
- Idempotency
- Replay protection
- Payment provenance
- Ledger locking
- Transactional domain events
- Safe domain-event replay
- Replay cannot re-run money/stock mutations
- Audit logging
- Secret isolation
- No secrets in frontend bundles
- No secrets in logs
- No raw secret storage in ordinary application tables
- Secure OAuth state
- Encrypted OAuth tokens
- Step-up authentication for sensitive financial actions
- Fail-closed authorization
- Production configuration preflight
- HTTPS production requirement
- Placeholder-secret rejection
- Security simulation suite

## 31. Domain events & reliability
- Transactional commerce events
- Event outbox
- Durable event records
- Replay-safe projections
- No money mutation on replay
- No stock mutation on replay
- Idempotent background jobs
- Pending payment reconciliation worker
- Provider reconciliation
- Error logging
- Structured logging
- Health endpoint
- Graceful failure handling

## 32. Currency & international commerce
- Multi-currency commerce
- Major global currencies
- Transaction currency
- Settlement currency
- Live FX integration for sourcing/conversion
- No silent historical currency relabeling
- Currency-aware pricing
- Currency-aware ledger entries
- Currency-aware reporting
- Provider capability constraints
- Explicit conversion boundaries

## 33. API / integrations platform
- Versionable internal API architecture
- Generated API client
- Generated API type declarations
- Zod validation layer
- Provider adapters
- Payment integrations
- AI integrations
- Social integrations
- Media integrations
- External-domain safety checks
- Idempotency support
- Integration health/status

## 34. Mobile / parity
- Responsive web experience
- Android application parity target
- iOS application parity target
- Shared commerce/backend contracts
- Mobile-friendly merchant dashboard
- Mobile-friendly customer storefront
- Mobile-friendly checkout

## 35. Developer / operations tooling
- TypeScript monorepo
- pnpm workspace
- Typecheck
- Production build
- Security simulation
- Production preflight
- Database migration runner
- Explicit migration ordering
- API test runner
- CI verification
- GitHub Actions
- Deployment/runtime compatibility
- No development dependency on Replit

## 36. Data integrity rules
- Immutable historical order pricing
- Immutable tax snapshots
- Immutable shipping snapshots
- Immutable provider payment evidence
- Double-entry ledger
- Money represented in integer minor units
- Exact payment matching
- Provider provenance
- Merchant/source price separation
- Durable media ownership
- Historical currency integrity
- Account obligation continuity
- Deletion records/audit preservation

## 37. Launch quality
- No fake payment success
- No fake provider balances
- No fake bank destinations
- No fake marketplace inventory presented as authoritative
- No fake social publishing claims
- No placeholder production secrets
- Error states
- Loading states
- Empty states
- Mobile responsiveness
- Accessibility
- Secure authorization on every protected mutation
- Real provider verification before financial state changes
- CI green before release
- Production preflight before deployment

## Rebuild rule
Every item above must ultimately resolve to real implementation. UI-only placeholders, localStorage-only financial state, fabricated provider responses, or disabled buttons do not count as implementation. Existing code is audited against this catalog and upgraded until each applicable feature is implemented and tested.
