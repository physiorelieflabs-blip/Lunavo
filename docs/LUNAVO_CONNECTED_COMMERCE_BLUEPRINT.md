# Lunavo Connected Commerce OS & Self-Hosted Intelligence Blueprint

## Purpose and status

This is the integration contract and capability target for Lunavo. It supplements the Master Specification and Feature Catalog; it does not replace them. The repository already contains many commerce, supplier, AI, payment, marketing, marketplace and operations modules. A path, screen, route, or historical feature branch is not proof that a workflow is production-complete. Before marking anything shipped, trace and test its actual UI → API → authorization → database → worker/provider → audit trail flow.

The goal is one coherent, self-hosted commerce operating system. Product research, sourcing, catalog, pricing, inventory, storefronts, customer orders, fulfillment, support, marketing, accounting and AI decisions must exchange trustworthy records and events. Do not build disconnected feature silos, duplicate existing screens, or claim a provider/model action succeeded without an observed result.

## Non-negotiable boundaries

1. GitHub is the source of truth. Make code and schema changes in GitHub; do not ask Replit Agent to implement them.
2. PostgreSQL and explicit domain services are authoritative for merchant data, stock, orders, payments, ledgers, permissions, approvals and operational state.
3. Flutterwave remains the only external money-provider adapter approved for the current scope. Its credentials stay server-side and encrypted/secret-managed. Do not add a hosted AI, database, search, storage, analytics, messaging or payment dependency as a hidden requirement.
4. All model inference and image generation must use model services deployed by the operator. A missing model is a visible capability/health state, never an excuse to invent an answer.
5. AI proposes; deterministic domain services validate; policy controls decide whether an action can be executed; protected services execute; audit records prove what happened.
6. No AI output may create money, payment success, a settlement, a supplier purchase, a stock count, a tracking number, a customer review, advertising metrics, a research citation, or a claim about an external action.
7. Supplier pages may be imported only through safe, lawful and permitted retrieval. Enforce public-DNS/IP validation, redirect revalidation, time/size limits, content-type validation, HTML sanitization, robots/terms restrictions where applicable, and SSRF protection. A public product URL is not proof that a supplier API, account or checkout is available.
8. Do not automatically purchase from a supplier, issue refunds, spend ad budget, publish externally, message customers, lower a price below its margin floor, or change permissions unless the exact action is supported, authorized, within configured limits and logged. Use an approval queue when any prerequisite is missing.
9. Never mark a capability as complete based on a UI control or a mock response. A feature needs persistence, server-side authorization, validation, failure behavior, observability and tests.

## 1. The shared commerce graph

Use shared, linked identifiers rather than separate module-specific copies of reality.

- **Merchant / workspace / store / location:** tenant and access scope; every query and mutation must resolve this scope server-side.
- **Supplier / supplier source / source snapshot:** source URL, canonical URL, supplier identity when verifiable, capture time, parsed fields, raw evidence hash, parser/version, observed currency, stock claim and source reliability.
- **Canonical product / variant / SKU / supplier mapping:** the merchant's sellable product identity is separate from each supplier listing and supplier SKU. Variants must map explicitly; do not match only on title.
- **Landed-cost calculation / pricing policy / recommendation:** currency, source cost, shipping, taxes/duties where known, payment/platform fees, FX rate source and timestamp, desired margin, safety buffer, calculated price and reasons. Unknown components remain unknown rather than silently becoming zero.
- **Inventory observation / reservation / movement:** supplier-reported availability is an observation; only the merchant's own inventory ledger or a verified fulfillment contract can be authoritative stock. Use reservations, expiry and atomic release/decrement rules.
- **Order / order line / supplier fulfillment group / supplier purchase attempt / shipment / return:** retain line-level supplier mapping, supplier cost snapshot, promised-shipping evidence, tracking source, retries, provider references and exception status. One storefront order may become multiple supplier shipments.
- **Payment intent / provider event / ledger transaction / refund / dispute / payout request:** immutable money snapshots, idempotency keys and ledger entries. Provider webhooks are evidence to verify, not trusted commands.
- **Customer / consent / segment / conversation / support case:** purchase history and communication permissions are merchant-scoped. Opt-out is enforced before any marketing send.
- **Campaign / creative / audience definition / spend record / attribution event:** only measured provider or first-party events contribute to reported performance; estimated attribution is labelled as estimated.
- **Automation policy / proposed action / approval / execution / rollback / audit:** store mode, allowed tools, action class, budgets, price/margin floors, exclusions, approval requirement and execution result.
- **AI run / model participants / prompt-template version / evidence references / output validation:** record the task, model IDs, selected route, failure/fallback, duration and validation result without logging secrets or unnecessary personal data.

A dashboard can aggregate those linked records, but it must not become a second source of truth.

## 2. The connected lifecycle

### A. Research → supplier → listing → profit → merchandising

1. Accept a public supplier/product URL or a supported local import file. Validate the URL and retrieve only permitted public content.
2. Preserve a source snapshot, timestamp, parser metadata and exact facts. Extract title, descriptions, variants, SKUs, images, price/currency, availability, shipping claims and specifications where evidence supports them.
3. Deduplicate against existing products and supplier mappings; flag ambiguous matches for review. Never merge variants because names merely look similar.
4. Optionally ask the local text/vision ensemble to normalize copy or classify evidence. Model-generated enrichment is separate from source facts and must identify unknowns.
5. Compare candidate suppliers using evidence-backed cost, recent stock observations, shipping coverage/time, reliability, returns terms, product-quality signals and source freshness. Show why a score changed.
6. Calculate landed cost, FX, platform/payment fees and margin using deterministic code. Produce suggested retail and maximum commercial prices with a full breakdown and required-data warnings.
7. Run risk/compliance checks (restricted items, claims, trademarks, authenticity, safety certifications and regional restrictions). Route risky or poorly evidenced listings for human review.
8. Create a draft product and media set. Publish only after required review and catalog validation.
9. Make the approved product available to storefront search, collections, recommendations, campaigns, order routing, analytics and the AI operator from the same canonical record.

### B. Checkout → verified payment → order → fulfillment

1. The server recalculates prices, available inventory, taxes, shipping and discounts from authoritative records. A browser total is never authoritative.
2. Create a pending order/payment session with immutable line, currency, fee and address snapshots; reserve inventory transactionally where the inventory strategy requires it.
3. Initiate payment through the configured provider; bind provider reference to the exact order, amount, currency and merchant.
4. A return URL only resumes status checking. A verified provider response/webhook with valid signature/reference/amount/currency is required before the system marks payment successful and posts ledger entries.
5. Emit an idempotent paid-order event. Evaluate supplier mappings, availability freshness, shipping constraints, fraud/risk flags, merchant permissions and fulfillment budget.
6. If a supported authorized supplier ordering operation exists, enqueue it with an idempotency key and explicit result tracking. Otherwise create a visible supplier-order task for the merchant; do not simulate a placed order.
7. Support bulk processing, order grouping, split shipments, supplier substitution review, retries with backoff, partial fulfillment, cancellation, late-shipment alerts and supplier exceptions.
8. Ingest real tracking numbers and delivery events from configured/verified sources. Keep source timestamp and carrier/status provenance. Notify customers only through a configured, authorized, consent-compliant channel.
9. Refund only through a supported provider flow; claim/idempotently lock the refund first and update accounting after verified provider success. A local refund request is not proof the provider returned funds.

### C. Supplier change → safe catalog action

1. A scheduled worker polls sources within rate limits or consumes a genuine supplier event where available.
2. Record every observation with retrieval time, observed value, currency and source. Do not label periodically checked data “real-time.”
3. Compare against last accepted values. Detect cost jumps, out-of-stock, removed variants, shipping changes and stale sources.
4. Apply merchant-configured policy: warn, hold new imports, buffer inventory, pause product, draft a price change or open approval. No silent unsafe price changes.
5. Recalculate price and margin deterministically using the freshest supported FX and cost inputs. If required inputs are stale/missing, pause high-risk automation and say why.
6. Propagate approved changes to storefront availability, collections, campaigns, product recommendations, order eligibility and business alerts.
7. Preserve a versioned diff and allow authorized rollback where safe.

### D. Store signals → marketing → measured outcomes

1. Build audience and product decisions from tenant-scoped orders, customer consents, inventory, margin, sales trends and supported traffic/campaign data.
2. The local AI ensemble drafts hooks, scripts, images, copy, SEO, landing-page ideas and creative variants from approved catalog facts.
3. The deterministic marketing engine checks product availability, claim evidence, discounts, margin, creative policy, consent and campaign budget.
4. Generate a draft and preview. Publishing is only available through a real, authorized adapter; no adapter/credentials means “draft only,” not “published.”
5. Store the provider-confirmed campaign/post IDs and measured delivery/spend/conversion data when available. Label first-party estimates distinctly.
6. Feed observed outcomes back into recommendations, product ranking and creative tests only when attribution and data quality are adequate. Keep the human-readable reason and evidence behind each recommendation.

### E. Customer problem → support → resolution → learning

Unify order, payment, tracking, supplier case, return, refund and dispute context into a support timeline. The support model can summarize verified records and draft policy-based replies. Sensitive disputes, exceptions, refunds and external messages require the configured approval/tool permissions. After a resolution, update case status and analytics from the actual execution result—not from the model's narrative.

## 3. Self-hosted multi-model intelligence

### Model responsibilities

Use one local inference gateway with explicit task routing. The current gateway contract supports a bounded pool of local OpenAI-compatible endpoints and the roles **primary**, **critic**, **coding** and **vision**. Image generation uses its separate locally deployed endpoint. Do not download model weights into Git or require external AI API keys.

- **Primary reasoner:** decomposes a task, identifies necessary data and tools, and proposes a structured plan.
- **Critic / verifier:** looks for unsupported claims, missing assumptions, conflicting evidence, policy violations and calculation mistakes. Prefer an independently configured critic for final review.
- **Coding / structured-tool planner:** produces schema-constrained plans, queries or transformations that are checked against an allowlist. It does not execute arbitrary code or gain database privileges.
- **Vision model:** extracts only visually supported product/media attributes. A tagged text-only pool must fail closed rather than be silently used for image understanding.
- **Optional future local specialists:** embeddings and reranking for semantic catalog search/deduplication, forecasting models for demand/stock signals, OCR for permitted product documents, and safety/moderation classifiers. These are deployment capabilities to implement and evaluate, not assumed to exist because a model name was configured.
- **Local image model:** produces image assets; server-side image-byte validation, size limits, format checks, metadata cleanup and persistence remain mandatory.
- **Deterministic business engines:** own pricing arithmetic, risk thresholds, budget checks, inventory reservation, permissions, payments, reconciliation, shipping rules and state transitions. LLMs must not replace these engines.

### How models should collaborate

1. **Classify:** identify the task, required data class, risk level and intended output schema.
2. **Retrieve:** use approved server-side tools to retrieve only the current merchant-scoped records necessary for the task. Never put payment secrets, session tokens, private keys or unrelated customer data into model context.
3. **Plan:** primary model proposes a short, bounded plan and the required facts/tools.
4. **Execute read-only tools:** validate every tool and argument against a server allowlist; call deterministic services for calculations and database reads. The model never gets arbitrary SQL or shell access.
5. **Cross-check:** for high/max reasoning, run independent text-capable models in parallel; keep vision-only models on the vision lane. Ask the critic to compare outputs against the source evidence and deterministic results.
6. **Validate:** enforce JSON/schema, numeric ranges, tenant boundaries, source references, product constraints, supported currencies and policy rules. Reject invalid output or fall back only to a truthful deterministic path.
7. **Propose:** return recommendation, supporting evidence, uncertainties, risks, estimated impact (only when calculable), approval requirement and undo plan.
8. **Authorize:** a policy engine checks the active merchant autonomy mode, roles, approval, budgets, limits, exclusions and freshness.
9. **Execute:** a domain service performs the permitted operation transactionally and idempotently.
10. **Observe:** persist the actual result, model participants, validation errors, latency, action audit and later business outcome. Use approved outcomes to improve ranking/evaluation; never silently self-modify policy or model weights.

Model ensemble is not “averaging opinions.” Preserve disagreements, compare each claim with evidence, prefer deterministic facts, and expose uncertainty. If the critic is unavailable, record that quality gate as skipped and follow the task's configured fallback policy; high-risk actions must not proceed merely because a judge timed out.

### Routing and quality policy

- Low-risk drafting may use one suitable local model.
- Supplier research, opportunity ranking, pricing explanations and major operational decisions should use multiple text specialists when configured, with deterministic evidence/scoring and critic review.
- Image extraction uses an explicitly suitable vision endpoint.
- Price, stock, payment, refund, payout, fulfillment and permission mutations always pass through domain-specific validation, regardless of model count.
- Set bounded model count, timeout, token/response size, concurrency, retry, per-task budgets and rate limits.
- Track success rate, schema validity, unsupported-claim rate, source-grounded accuracy, latency and human override rate by task and model version.
- Test role routing, endpoint failures, malformed JSON, critic disagreement, timeout, missing models, injection attempts in supplier text and attempts to request unauthorized tool actions.
- Do not claim the models have been empirically benchmarked or that a particular open model is best until this deployment has measured it on a representative test set.

## 4. Modern dropshipping capability target

Treat these as parity targets to audit against existing code, then implement in coherent batches. Do not create duplicates when a capability already exists; improve the real flow and tests instead.

### Sourcing and supplier intelligence
- URL-only public product import where permitted; batch URL import and CSV/XLSX import/export.
- Multiple supplier candidates per canonical product; exact variant/SKU mapping and fallback supplier ranking.
- Product opportunity research, niche/category filters, trend/demand and competition evidence, saturation checks, seasonality and confidence/freshness labels.
- Supplier quality score based on observed fulfillment, cancellations, price stability, tracking reliability, return terms and verified merchant feedback.
- Supplier/source notes, contact details when publicly provided, response/SLA history and issue history.
- Sampling/manual quality-check workflows, product approval and source evidence retention.
- Local adapters for lawful extraction; explicit capability declarations for order placement, stock refresh and tracking. Never infer an API/order capability from a public product page.
- Product duplicate matching, change detection, disambiguation queues and source history.

### Product and listing factory
- Draft/approve/publish/archive lifecycle; bulk edit, clone, import, export, tags, collections, categories and product bundles.
- Variant-level price, SKU, barcode, shipping weight/dimensions and mapping; guard against mismatched variants.
- SEO titles/descriptions, structured data where supported, image alt text, URL slugs and localization.
- Fact-grounded copy rewriting, image cleanup/resizing/cropping/watermark tools and locally generated editorial/lifestyle images.
- Draft validation for incomplete dimensions, unclear shipping, unsupported claims, restricted-product risk and low-quality imagery.
- Store-specific listing overrides without losing the canonical source product or supplier evidence.
- Product kits/bundles, cross-sell relationships, subscriptions and print-on-demand adapter boundaries where implemented.
- Media provenance, ownership, copyright/usage metadata when known, image-byte validation and durable storage.

### Pricing, costs and FX
- Landed-cost calculator with supplier item cost, supplier shipping, import duties/tax when known, local fulfillment, packaging, gateway/provider fee, Lunavo transaction fee and FX conversion.
- Live-updated FX through a self-hosted retrieval/cache process with source/time/staleness status; no invented or hard-coded “live” rate. Preserve historical transaction FX snapshots.
- Cost-plus, target-margin, fixed-price, tiered, compare-at and policy-based pricing; per-store/per-category/per-product rules.
- Minimum margin/floor, maximum percentage changes, rounding rules, regional price lists and rounding-aware tax/shipping calculations.
- Price change simulations and approval queue; cost/FX shocks pause unsafe automation.
- Full profit, contribution margin and cashflow view, separating revenue, gross margin, supplier cost, shipping, fees, refunds and actual net.
- Alerts for negative margin, unprofitable ads, supplier price changes and stale cost inputs.

### Inventory and availability
- Supplier cost/stock/shipping monitoring with scheduled cadence, source timestamps, throttling, retry and stale-data flags.
- Merchant inventory ledger, locations/warehouses, reservations/expiry, transfers, adjustments and reconciliation.
- Configurable stock buffer, pause/draft/zero-quantity behavior, low-stock alerts and oversell prevention.
- Keep supplier observations distinct from owned/committed stock; unknown supplier stock is not available stock.
- Variant-level inventory and multiple suppliers, with atomic fallback/reservation policies.
- Backorder/preorder rules only when clearly disclosed and supported.
- Inventory exceptions feed storefront availability, checkout, ads, recommendations and order routing.

### Order and fulfillment automation
- Order eligibility gates; line-level supplier/variant mapping; fulfillment routing by price, availability, delivery promise, region and supplier reliability.
- Manual, approval-required and authorized auto-fulfillment modes; bulk processing and scheduled batches.
- Idempotent supplier order requests, external reference persistence, duplicate-prevention, retry/backoff and ambiguous-result recovery.
- Multi-supplier orders, split packages, partial fulfillments, substitutions requiring approval, cancellation and return states.
- Supplier order queue, payment/ordering tasks, purchase confirmations and exception inbox.
- Carrier/tracking capture from verified sources, milestone updates, delayed/lost/damaged package monitoring and real delivery estimates with evidence.
- Customer tracking page and notification timeline; supported email/push/SMS delivery only when the local service or authorized adapter actually confirms sending.
- Returns, exchanges, supplier claims, refund/dispute handoffs, restocking and ledger reconciliation.
- Custom branding, packing slips, inserts and private-label workflows only where the supplier/fulfillment path confirms support.
- Supplier SLA, delivery-time and defect reporting; never generate a fake tracking number to fill a blank state.

### Storefront and commerce
- Multiple stores and brands under one merchant; mobile-first custom storefront builder, sections/themes, preview, versioned publish/rollback and safe custom CSS/HTML boundaries.
- Custom domains/subdomains, redirects and domain verification when configured.
- Product pages, variants, search/filter/sort, collections, recommendations, bundles, cart, checkout and customer account/order tracking.
- Markets/locales, multi-currency display with properly defined payment/settlement currency behavior, translations, regional availability and currency-aware price lists.
- Discounts, coupons, free-shipping thresholds and promotions with stacking/eligibility rules and margin floors.
- Abandoned-cart recovery and post-purchase sequences with consent and opt-out enforcement.
- Product reviews only from genuine eligible purchasers; moderation, abuse reporting and no generated/fabricated reviews.
- Digital goods, subscriptions, memberships, bookings, services and tickets must use their own fulfillment lifecycle instead of pretending they are physical dropship goods.
- POS, invoices, payment links, receipts and customer support remain connected to the same order and ledger records.

### Marketing and customer growth
- First-party SEO/content tools, email template/editor and local scheduler/outbox; messaging adapters are optional and never a core dependency.
- Local Ad Studio with product-grounded copy, image and video workflows, creative variant management, campaign calendar and approvals.
- Audience/customer segmentation, cohorts, repeat-purchase and churn-risk signals, upsell/cross-sell, loyalty and referral mechanics.
- A/B tests for product pages, price/offer and creative where sample quality supports a meaningful result.
- Abandoned checkout/cart workflows, order updates, win-back and post-purchase education; respect consent and frequency caps.
- Campaign spend, impressions, clicks and conversions are displayed only from first-party measurements or confirmed providers, with modeled attribution labelled separately.
- Campaign pause/budget caps, product-availability checks, negative-margin checks and emergency stop.
- Social publishing drafts and actual provider adapters separated; a generated caption does not imply it was published.

### Finance, risk and operations
- Double-entry ledger, verified provider events, platform/provider fees, reserves, refunds, disputes, chargebacks, manual withdrawals, reconciliation and exception queues.
- Subscription/referral/marketplace billing consistent with the existing canonical pricing rules; preserve history and idempotency.
- Role/permission control for merchant, staff, finance and master admin; tenant isolation and separation of duties.
- Fraud/risk signals, anomaly alerts, velocity limits, abuse detection and review queues; risk scores inform but do not replace deterministic restrictions.
- Unified notifications/activity inbox, operational dashboard, scheduled reports and exportable records.
- Data export/account deletion workflows where legally applicable, privacy/consent records, retention controls and auditable privileged access.
- Backups, restore drills, migration verification, health checks, metrics/logging, job retry/dead-letter visibility, incident runbooks and secure release gates.
- Accessibility, keyboard operation, responsive mobile layouts, pagination, search, empty/error/loading states and useful support documentation.

### Autonomous business operator

Autopilot should be a permissions-and-policy-governed operator spanning these workflows, not a separate chat screen that cannot act on real data.

- Modes: Off, Assist, Approval Required, Full Autopilot; user-visible per-tool permissions and emergency stop.
- Goals and constraints: revenue/conversion/margin/stock goals; spend and supplier-order caps; minimum margin; discount/price bounds; protected products; time windows and exclusions.
- Run an observe → diagnose → propose → policy-check → approve/execute → verify → report cycle.
- Shared task queue, dependencies, idempotency, retries, deadline, cancellation, compensation/rollback and human handoff.
- Daily/weekly briefs, actual actions vs recommendations, success/failure outcomes, business impact and evidence behind each decision.
- Product research can influence sourcing; supplier signals can change inventory/pricing; those changes can gate ads; ad outcomes feed product ranking; order/return outcomes feed supplier reliability; all of this uses the same real records.
- The owner can pause all automation. Every action must disclose reason, evidence, limits used and actual execution status.

## 5. Cross-module event spine

Use the repository's existing domain-event/outbox infrastructure where appropriate; do not create a second competing event bus. Standardize an event envelope containing event ID, event type/version, tenant/store ID, aggregate ID/version, occurred-at time, actor/source, idempotency key and a minimal validated payload.

Initial event families to trace/standardize include:

- sourcing: source registered, supplier product imported/updated, accepted refresh, source fetched, observation changed, candidate scored, listing draft created, listing approved/published;
- catalog/inventory: product or variant changed, cost/FX stale, source stock changed, stock reserved/released/committed, product paused;
- checkout/payment: checkout created, provider event received/verified/rejected, payment posted, refund requested/verified, dispute opened, reconciliation mismatch;
- order/fulfillment: paid order eligible, supplier task queued, supplier order confirmed/ambiguous/failed, shipment added, tracking changed, delivery exception, return opened/resolved;
- growth: campaign drafted/approved/published/paused, creative tested, spend threshold reached, conversion attributed, opt-out recorded;
- autonomy: task planned, approval requested/granted/rejected, action executed/failed/rolled back, safety stop activated;
- support: case opened/escalated/resolved, notification queued/sent/failed.

Consumers must be idempotent and observable. Projection rebuilds may recompute read models, but must never replay authoritative money, fulfillment purchases or inventory mutations. Critical actions go through their existing transactional domain services.

## 6. Priority implementation order

1. **Audit actual coverage first:** map each feature from UI to route, permission, schema/migration, worker/provider, tests and error paths. Record statuses as implemented-and-tested, partially implemented, absent, blocked by infrastructure, or unsafe. Do not equate file existence with done.
2. **Protect the core:** close payment/ledger/idempotency and tenant-isolation issues; validate migration order; test stock reservations, order/payment linkage, webhook replay, refunds, withdrawals and admin separation.
3. **Unify catalog economics:** canonical variant/supplier mapping, evidence provenance, landed costs, price rules, stale-data state and supplier reliability.
4. **Finish the full order path:** paid order → eligible supplier task → confirmed outcome → shipment/tracking → customer status → return/refund and reconciliation, with manual fallbacks where suppliers cannot be programmatically ordered.
5. **Connect the event spine:** source changes trigger inventory/pricing/availability decisions; order and fulfillment outcomes feed analytics and supplier reliability; product changes gate advertising; campaign results feed recommendations.
6. **Harden the model gateway:** task capability routing, diverse local ensemble, critic validation, schema checks, explicit failure states, evidence context, performance telemetry and evaluations.
7. **Finish merchant workflows:** product research/import review, bulk editing, multi-store management, order/exception queues, returns, customer support, campaigns, reports and mobile parity.
8. **Safe Autopilot:** per-action permissions, dry-run, spend/purchase/price caps, approvals, idempotent queues, pause-all, rollback/compensation and audit reports.
9. **Production proof:** run all CI/typecheck/build/security audits, endpoint contract tests, migration smoke tests and critical workflow simulations; perform deployment-specific smoke tests using real authorized provider settings before declaring launch-ready.

Do not introduce a broad rewrite when a targeted change fixes the actual contract. Prefer small reviewable pull requests with tests. Keep the master specification, feature catalog and this blueprint in sync with verified implementation changes.

## 7. Definition of done

For every feature or workflow, answer yes to all applicable questions:

- Is the UI actionable and connected to the real API?
- Is actor and tenant authorization enforced server-side on every path?
- Is persistent schema/migration correct and registered?
- Are monetary and inventory values server-computed and historical snapshots immutable?
- Are external operations verified, idempotent and recoverable after timeout/duplicate delivery?
- Are stale/missing evidence and unavailable integrations visible rather than fabricated?
- Are error, loading, empty, retry and approval states usable?
- Are audit, logs/metrics and alerts sufficient to investigate failure?
- Are unit/integration/security/race/replay tests present?
- Does CI build and typecheck pass?
- Are secrets and private customer information protected?
- Can an operator deploy and operate the capability without an unapproved hosted API?

A failure on a critical money/security/tenant boundary blocks release, regardless of how polished the interface looks.

## 8. Public feature references used for the parity checklist

These official product pages were reviewed for broad dropshipping capability patterns—product discovery/import, supplier and variant mapping, price/stock monitoring, bulk order processing, automated fulfillment, tracking synchronization, multi-store operations, branded fulfillment, bundles and analytics. They are references for market expectations, not dependencies and not claims that Lunavo has parity yet.

- AutoDS product and plan capabilities: https://www.autods.com/pricing/
- DSers sourcing, supplier mapping, pricing/inventory rules and order automation: https://www.dsers.com/en/features
- Zendrop fulfillment, branding, bundles and subscriptions: https://zendrop.com/features/
- Spocket product importing, stock synchronization, branded invoicing and fulfillment examples: https://www.spocket.co/blogs/spocket-vs-dropified


## Additional hardening invariants

Supplier URL import must reject non-public/special-use IPv4 and IPv6 addresses, pin sockets to validated DNS addresses, revalidate every redirect and reject embedded URL credentials. Fulfillment state changes require the evidence appropriate to the target state. Pricing may not recommend a price below its deterministic landed-cost margin floor or above the observed market ceiling.
