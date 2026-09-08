# Lunavo — Self-Hosted-First Architecture

## Non-negotiable boundary

Lunavo is self-hosted by default. Core commerce, data, media, automation, AI, search, analytics, notifications, and creative generation must run on infrastructure controlled by the operator. External services are adapters, never hidden requirements. **Money movement is the deliberate exception:** real regulated payment rails may be connected through TS Pay adapters; Lunavo must never pretend its internal ledger is a bank or payment processor.

## The Lunavo Intelligence Fabric

Every intelligent feature uses one internal gateway:

`Lunavo modules → Intelligence Gateway → local model/runtime → local data + tools`

The gateway supports model routing, structured output, embeddings, RAG, document understanding, OCR, speech, vision, image generation, video/audio creative pipelines, evaluations, prompt/version management, permissions, tenant isolation, quotas, audit logs, and graceful deterministic fallbacks.

The model runtime must be replaceable. A deployment can use local CPU inference for lightweight tasks and local GPU inference for larger language/vision/image/video models without changing commerce code. No feature may silently call a hosted AI API.

## Self-hosted feature registry

### Commerce core
- Multi-tenant merchants and stores
- Unlimited stores per paid merchant account
- Storefronts, themes, branding, custom domains, navigation, pages and SEO
- Product catalog, variants, SKUs, categories, collections, pricing and availability
- Supplier/product-link ingestion with review, mapping and editing
- Inventory, reservations, stock movements and fulfillment
- Orders, returns, refunds, invoices, discounts, reviews and customer accounts
- POS and connected-record workflows
- Marketplace, merchant approval, listings, marketplace fees and auctions
- Digital products, courses, memberships, subscriptions, services, bookings and events/tickets
- Wishlist, saved carts, loyalty, gift cards and affiliates
- CRM, customer segmentation, campaigns, analytics and reporting
- Shipping: manual, carrier, automatic rates, tracking, pickup, local and international workflows
- Tax calculation/recording architecture with pluggable local rules
- Notifications, templates, email/SMS delivery adapters and in-app notifications
- Merchant/admin workspaces, staff roles, permissions, audit trails and security controls
- Developer APIs, API keys/scopes/rotation, webhooks, secrets, usage logs and documentation
- Exports, imports, backups, restore, data portability and operational observability

### TS Pay and money boundary
- TS Pay remains the first-party payment operating layer and source of truth
- Unified transaction model and double-entry internal ledger
- Checkout, payment links, invoices, balances, fees, refunds, disputes, reconciliation and payout requests
- Transaction currency and settlement currency are distinct
- Provider fees and Lunavo's 1% transaction fee are separately recorded
- Flutterwave is the initial real payment rail; additional rails are adapters
- Provider webhooks are authenticated and transactions are re-verified before authoritative accounting
- Internal transfers are not external bank settlement
- No fake payment success, fake balances or invented bank destinations

### Local intelligence
- Merchant Copilot and admin Copilot
- Store-builder intelligence
- Product description/title/SEO/category generation
- Product enrichment and catalog cleanup
- Semantic search, recommendations and merchandising
- Demand, inventory and sales forecasting
- Margin/pricing intelligence and anomaly detection
- Customer segmentation, churn/retention and next-best-action suggestions
- Marketing planning, campaign generation and optimization
- Fraud/risk signals with deterministic approval boundaries
- Workflow automation and event-driven agents
- Knowledge/RAG over merchant-owned documents and catalog data
- Developer assistant and API documentation intelligence
- Academy/TS Guide intelligence
- Research assistant with source-attributed evidence and limitations

### Local image and media studio
- Product image generation
- Product background generation/replacement
- Lifestyle scenes and catalog photography
- Brand-consistent hero banners and storefront artwork
- Image editing, inpainting/outpainting, object/background removal, relighting, resizing, upscaling and variants
- Logo/brand asset assistance without inventing protected marks
- Image quality inspection and byte/type validation
- Creative asset library with durable tenant ownership
- Static ad generation
- Product ad generation
- Short-form video ad generation
- Multi-aspect-ratio adaptation
- Local voice-over/TTS and audio cleanup
- Captions/subtitles and timing
- FFmpeg-based composition, stitching, transitions and export
- Brand kits, reusable templates and creative presets
- Campaign variants, A/B creative families and controlled experiments
- Performance-aware creative recommendations
- Social-ready export packages; provider-specific publishing remains an optional adapter

### Advanced additions
- AI merchandising autopilot with approval modes
- Autonomous catalog quality auditor
- Intelligent duplicate/near-duplicate product detection
- Semantic bundle and cross-sell builder
- Automated landing-page composer
- Conversion-rate experiment planner
- Creative fatigue detection
- Competitor/product intelligence from explicitly supplied or legally accessible sources
- Local document OCR and invoice/receipt extraction
- Local speech-to-text for merchant notes and support calls
- Local translation and localization engine
- Multi-language storefront content
- Accessibility auditor and auto-fix suggestions
- SEO technical auditor and internal-link planner
- Customer-support inbox with local knowledge grounding
- Return-reason intelligence
- Fulfillment exception detector
- Stockout and overstock early-warning system
- Promotion guardrails that protect merchant margins
- Scenario simulator for price, discount, inventory and campaign decisions
- Business health score with explainable evidence
- Daily autonomous operations briefing
- Workflow builder with schedules, triggers, conditions and human approvals
- AI evaluation suite for regression tests, hallucination checks and tenant-boundary checks
- Model registry and capability routing
- Local vector index and retrieval layer
- AI audit log with prompt/model/version/output metadata
- Per-tenant AI policies, budgets, tool permissions and kill switches

## Self-hosted infrastructure target

Recommended deployment primitives are PostgreSQL, local object storage (S3-compatible), Redis-compatible queues/cache, a local vector index/database, FFmpeg, local OCR/STT/TTS, and a replaceable local model runtime. Containerized deployment should be reproducible with health checks, migrations, backups, metrics, logs and readiness probes.

## Definition of done

A feature is not considered self-hosted merely because the UI exists. Its runtime path, storage, AI dependency, queueing, media processing, authentication, authorization, and persistence must all have a controlled local implementation or an explicit adapter boundary. Hosted providers may enhance a deployment, but disabling them must not silently break core commerce.
