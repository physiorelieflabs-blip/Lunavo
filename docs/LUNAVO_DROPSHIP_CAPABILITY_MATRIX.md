# Lunavo Dropshipping Capability Matrix

This document is the practical capability audit for Lunavo's dropshipping operating system. It is intentionally stricter than marketing checklists: a capability is considered implemented only when its server boundary, persistence/state, authorization, failure behavior, and real integration path exist.

## Connected core

| Capability family | Lunavo state |
|---|---|
| URL-only supplier import and AI enrichment | Implemented |
| Multi-source supplier mappings | Implemented |
| Destination-aware supplier routing | Implemented |
| Margin-aware supplier fallback | Implemented |
| Source price/availability authority | Implemented |
| Price/stock synchronization guardrails | Implemented |
| Dropshipping fulfillment and tracking | Implemented |
| Orders, reservations and concurrency-safe stock | Implemented |
| Dynamic pricing and pricing recommendations | Implemented |
| Product research/evidence provenance | Implemented; public competitor/ad-spy product URLs can be safely observed, price-normalized and saved with source URL/domain, observation time, extraction evidence, caveats, idempotency and a durable domain event |
| Self-hosted multimodal product understanding | Implemented |
| Self-hosted multi-role reasoning brain | Implemented; dedicated finance specialist added to max-consensus dropshipping plans |
| Local specialist ensemble + reviewer/arbiter | Implemented; arbiter retries only across local profiles and labels a conservative partial result if synthesis is unavailable |
| Cross-domain merchant intelligence graph | Implemented |
| Demand forecast + reorder recommendation | Implemented |
| Landed-cost scenarios and contribution-margin calculation | Implemented (merchant-entered, evidence-qualified estimate; not statutory or final-profit authority) |
| Customer LTV/recency/segment scoring | Implemented |
| Consent-gated next-best-action recommendations | Implemented |
| Abandoned cart recovery | Implemented |
| Reviews/Q&A/wishlist/price watch/back-in-stock | Implemented |
| Same-SKU Buy-X-Get-Y-free promotions | Implemented; integer minor-unit pricing, bounded terms, usage-limit locking, redemption reservations and immutable term snapshots |
| Advertising planning/rendering/measurement | Implemented |
| Social publishing architecture | Implemented |
| Marketplace, auctions and advanced operations | Implemented |
| Returns/exchanges + branded tracking/returns portal | Implemented; customer requests are records for merchant review, not automatic refund authority |
| B2B/company/price-list operation primitives | Implemented; full catalog and order UX remains a closure target |
| Invoices/payment links/subscriptions | Implemented |
| Server-enforced discount codes | Percentage/fixed plus same-SKU Buy-X-Get-Y-free; minor-unit calculations, usage capacity reservations and redemption snapshots |
| Internal automation engine | Implemented |
| Durable domain-event outbox | Implemented |
| Master Admin/security/audit | Implemented |

## Self-hosted intelligence mesh

The shared commerce brain now supports a local route per specialty (orchestrator, researcher, merchandiser, growth, operations, customer, finance, creative, reviewer, coder) plus a separately configurable arbiter. Routes can use different local model identifiers and private/local OpenAI-compatible endpoints; unset role routes inherit a bounded profile fallback. The final dropshipping command stores its model diversity result, contributors, roles and consensus status with the plan so a single-model fallback is not presented as a full ensemble.

Default profile intent:
- Fast triage: Qwen 3 4B.
- General commerce language/extraction: Qwen 3 14B.
- Deep reasoning and multi-step planning: DeepSeek R1 14B.
- Product vision and independent review: Gemma 3 12B.
- Code-oriented analysis: Qwen 3 Coder 30B.
- Final arbitration starts with the fast profile to keep the ensemble bounded; deployments with more memory can override the arbiter model/endpoint in local environment settings.

These are configurable model defaults, not proof that the weights are installed or healthy. Operators must install the local weights and configure the runtime. Admin runtime diagnostics report configured profiles, dedicated role routing and actual model reuse. Every recommendation remains subordinate to verified payment/ledger, server inventory, tenant authorization and approval boundaries.

## Modern dropshipping capabilities that Lunavo must keep as first-class connected domains

Current commercial platforms increasingly combine supplier discovery/import, automated fulfillment, tracking, price/stock synchronization, product research, AI optimization, bundles/BOGO, country-based supplier fallback, multi-store management, branded experiences, print-on-demand, private products, customer lifecycle growth, and B2B/wholesale. The external comparison baseline used for this audit includes AutoDS, DSers, Zendrop, Spocket, Syncee and Shopify's current B2B/channel tooling.

### Connected now
- Product sourcing -> supplier intelligence -> supplier fallback -> forecast -> inventory -> fulfillment.
- Supplier cost -> landed cost -> contribution margin -> pricing guardrail -> conversion/ad signal.
- Order -> customer spend/LTV -> lifecycle segment -> consent eligibility -> retention/cross-sell recommendation.
- Ad performance -> winner/decline signal -> sourcing/pricing/growth recommendation.
- Intelligence refresh -> durable domain event -> Automation Studio.
- Supplier quote draft -> manually recorded or supplier-portal offer -> accepted/rejected/expired negotiation record -> quote-to-cost prefill -> landed-cost scenario -> contribution margin -> the same cross-domain intelligence graph and local reviewer.
- Single-SKU checkout -> percentage/fixed/BOGO rules -> bounded redemption reservation -> inventory reservation -> provider-verified payment -> redemption settlement/release; discount terms and amounts are snapshotted for audit.
- Supplier quote draft -> expiring seven-day one-use share link -> supplier response page -> atomic quote recording and token consumption -> domain event/merchant notification -> quote review and acceptance/rejection -> landed-cost model. Only a SHA-256 token digest is stored; the merchant manually shares the link. The link does not imply supplier identity verification, an external message, a purchase order, or a payment.
- Cost scenarios and quote records are tenant-scoped, idempotency-protected and auditable; they do not create a purchase order, payment, ledger entry or inventory movement.
- External research -> evidence ledger -> local model synthesis; research is never treated as authoritative payment, stock or customer-consent truth.

### Adapter-ready / credential-dependent
These must remain real provider adapters rather than fake in-app completion:
- Shopify / WooCommerce / Etsy / Amazon / TikTok Shop / Wix and other external sales channels.
- 3PL and fulfillment-network connectors.
- Email/SMS delivery providers or self-hosted SMTP/SMS gateways.
- Print-on-demand and custom packaging suppliers.
- Private-agent/private-supplier fulfillment.
- EDI and enterprise B2B connectors.
- External ad-platform publishing beyond already-supported adapters.

### Next capability closure targets

These are the remaining significant gaps identified by the repository audit. Build them through shared order, inventory, payment, supplier, consent, event and approval boundaries rather than isolated tables.

- Multi-line cart/order-item model for virtual bundles, mix-and-match, cross-SKU BOGO and cart-level price snapshots. Same-SKU Buy-X-Get-Y-Free is live; cross-SKU bundle discounts are not claimed until per-item stock, payment allocation, shipment splitting, refunds and idempotent fulfillment are implemented together.
- Approved return/exchange execution: explicit refund eligibility and amount, provider refund boundary, ledger reversal, restock inspection/grade, inventory movement and customer notification. A return request or approval alone must never refund money or restock inventory.
- Channel-specific adapters and verified pull/push implementation for catalog, inventory, orders, tracking and fulfillment. The control plane/worker is present; each channel must only report success after remote provider acknowledgement plus local reconciliation, with cursor/version checks and idempotent replay.
- 3PL split-shipment routing, multi-package tracking, stock-location allocation and SLA-aware fulfillment selection on top of a proper order-item/shipment model.
- POD/private-label/custom-packaging sourcing, variant mockup/artwork workflow, production lead-time comparison and supplier-specific quality/reprint evidence.
- Automated outbound supplier message/quote delivery adapters, supplier identity verification and authenticated provider-side replies. The secure one-time supplier quote portal currently handles inbound offers after a merchant manually shares its link; it does not itself send email/SMS or message a supplier platform.
- Evidence-backed duty/import/tariff rules from authoritative jurisdiction-specific sources, dated by effective period, normalized to the transaction currency and kept distinct from operator-entered estimates.
- Consent-gated email/SMS lifecycle campaign delivery with provider adapters, suppression/unsubscribe enforcement, bounce/complaint handling, delivery events and retry-safe idempotency. Current lifecycle recommendations remain advisory unless delivery is verified.
- Scheduled competitor/ad-spy monitoring and real advertising/search connectors. Public URL capture is available and feeds the operating graph, but scheduled recapture or a live ad-network connector must not be claimed until a source adapter and successful fetch evidence exist.
- Wholesale quantity breaks, customer/company-specific catalogs, negotiated price lists, payment terms/credit limits, tax-exempt evidence and B2B ordering UI. Current B2B/company/price-list records are primitives, not a full self-service wholesale checkout.
- Returns portal automation, channel/provider operations and all new external actions need observability, per-tenant limits, operator-visible retries/dead letters and end-to-end tests before being marked fully implemented.

## Non-negotiable architecture rules

1. Self-hosted AI models may collaborate, critique, rank and synthesize; they may not invent facts or silently become financial/inventory authority.
2. The model ensemble uses specialist roles plus an arbiter. The system should prefer consensus when high-impact decisions are requested, while remaining resource-aware for routine tasks.
3. Provider-verified payment state and the internal ledger remain financial truth.
4. Server inventory remains inventory truth; supplier stock is advisory until synchronized.
5. Forecasts are estimates with confidence/evidence and never direct stock mutations.
6. External competitor/ad-spy information is evidence, not truth, and must retain source and observation time.
7. Marketing recommendations remain consent-gated.
8. Automation can create recommendations/reservations/events, but settlement, payout, inventory mutation and external publishing remain dedicated guarded boundaries.
9. Every new capability must participate in the operating graph and durable event flow rather than becoming a disconnected feature island.

## External capability baseline

- AutoDS: product sourcing/import, automated fulfillment, price/stock monitoring, AI product discovery, bundles and ad-spy style research.
- DSers: AI product optimization, bulk price/stock updates, variant matching, bundles/BOGO, country-based supplier selection and global fallback, bulk order processing and tracking synchronization.
- Zendrop: automated fulfillment, branding, private product listings, chargeback support, trending product discovery and print-on-demand/custom products.
- Spocket: supplier marketplace, product sourcing, automated dropshipping, tracking, branded invoicing and print-on-demand/customization.
- Syncee: product import, automated order/tracking sync, pricing controls, supplier marketplace, cross-selling/upselling and wholesale/dropshipping workflows.
- Shopify B2B/Enterprise: companies and locations, catalogs, quantity/payment terms, supplier/marketplace/channel connectivity and enterprise workflows.

Last audited: 2026-10-11.
