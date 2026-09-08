/**
 * Unified capability registry for Lunavo.
 *
 * This is deliberately a domain-level contract rather than a UI menu. Features
 * are grouped by the business objects/events they consume and produce so new
 * screens do not become isolated islands.
 */
export type CapabilityDomain =
  | 'commerce' | 'dropshipping' | 'catalog' | 'inventory' | 'orders'
  | 'customers' | 'marketing' | 'creative' | 'payments' | 'finance'
  | 'fulfillment' | 'marketplace' | 'storefront' | 'automation'
  | 'analytics' | 'ai' | 'admin' | 'developer' | 'education' | 'services';

export type Capability = {
  id: string;
  domain: CapabilityDomain;
  name: string;
  description: string;
  selfHosted: boolean;
  moneyRailRequired?: boolean;
  inputs: string[];
  outputs: string[];
  related: string[];
};

const c = (
  id: string,
  domain: CapabilityDomain,
  name: string,
  description: string,
  inputs: string[],
  outputs: string[],
  related: string[],
): Capability => ({ id, domain, name, description, selfHosted: true, inputs, outputs, related });

export const LUNAVO_CAPABILITIES: Capability[] = [
  c('catalog.product-import', 'catalog', 'Product URL importer', 'Import accessible product data from a supplier/product URL, then review and map before publishing.', ['supplier.url'], ['product.draft'], ['catalog.variant-mapping', 'catalog.duplicate-detection', 'dropshipping.supplier-intelligence']),
  c('catalog.bulk-import', 'catalog', 'Bulk product import', 'Create and update products in batches with validation and rollback-safe jobs.', ['product.draft[]'], ['product[]'], ['catalog.product-import', 'inventory.sync']),
  c('catalog.variant-mapping', 'catalog', 'Variant and SKU mapping', 'Normalize variants, SKUs, options and supplier identifiers.', ['supplier.product', 'product.draft'], ['product.variant[]'], ['catalog.product-import', 'inventory.sync']),
  c('catalog.duplicate-detection', 'catalog', 'Duplicate detection', 'Detect duplicate or near-duplicate products, variants and media.', ['product[]'], ['duplicate.report'], ['catalog.bulk-import', 'ai.knowledge']),
  c('dropshipping.supplier-intelligence', 'dropshipping', 'Supplier intelligence', 'Score supplier reliability, cost, shipping time and exception history.', ['supplier[]', 'fulfillment.event[]'], ['supplier.score[]'], ['dropshipping.product-research', 'fulfillment.exceptions']),
  c('dropshipping.product-research', 'dropshipping', 'Product research', 'Score products for demand, competition, saturation, shipping and profitability.', ['catalog.product', 'analytics.market', 'supplier.score'], ['product.opportunity'], ['pricing.profitability', 'ai.next-best-action']),
  c('pricing.profitability', 'commerce', 'Profitability engine', 'Calculate landed cost, fees, discounts, refunds, break-even and safe selling prices.', ['product.cost', 'shipping.rate', 'payment.fee', 'platform.fee', 'discount'], ['profitability.snapshot'], ['pricing.recommendation', 'analytics.profit']),
  c('pricing.recommendation', 'commerce', 'Smart pricing', 'Recommend prices and guardrails without allowing AI to bypass financial rules.', ['profitability.snapshot', 'sales.metrics'], ['price.recommendation'], ['pricing.profitability', 'ai.next-best-action']),
  c('inventory.sync', 'inventory', 'Inventory synchronization', 'Keep product, order, fulfillment and storefront stock state consistent.', ['order.event', 'fulfillment.event', 'supplier.event'], ['inventory.event'], ['storefront.stock-alerts', 'analytics.inventory']),
  c('inventory.forecasting', 'inventory', 'Demand forecasting', 'Forecast demand, stockouts and overstock using local analytics/AI.', ['sales.metrics', 'inventory.history'], ['inventory.forecast'], ['inventory.sync', 'ai.business-health']),
  c('orders.lifecycle', 'orders', 'Order lifecycle', 'Coordinate checkout, payment verification, allocation, fulfillment, returns and refunds.', ['checkout.event', 'payment.event', 'fulfillment.event'], ['order.event'], ['payments.ts-pay', 'fulfillment.orchestration', 'customers.crm']),
  c('fulfillment.orchestration', 'fulfillment', 'Fulfillment orchestration', 'Route eligible orders into supplier/carrier workflows and track exceptions.', ['order.paid', 'supplier.score'], ['fulfillment.job', 'fulfillment.event'], ['orders.lifecycle', 'fulfillment.exceptions']),
  c('fulfillment.exceptions', 'fulfillment', 'Fulfillment exception center', 'Detect delays, failed fulfillment, missing tracking and supplier exceptions.', ['fulfillment.event', 'shipping.tracking'], ['exception.alert'], ['customers.notifications', 'dropshipping.supplier-intelligence']),
  c('payments.ts-pay', 'payments', 'TS Pay operating layer', 'Maintain payment intents, provider references, internal ledger state, refunds and reconciliation.', ['checkout.request', 'provider.webhook'], ['payment.event', 'ledger.entry'], ['orders.lifecycle', 'finance.reconciliation']),
  c('finance.reconciliation', 'finance', 'Financial reconciliation', 'Reconcile provider transactions, fees, refunds, platform fees, settlements and merchant net.', ['payment.event', 'settlement.event'], ['reconciliation.report'], ['payments.ts-pay', 'analytics.finance']),
  c('customers.crm', 'customers', 'Unified CRM', 'Build a customer profile from orders, carts, support, memberships and marketing events.', ['order.event', 'cart.event', 'customer.event'], ['customer.profile'], ['marketing.segmentation', 'customers.retention']),
  c('customers.retention', 'customers', 'Retention intelligence', 'Detect churn risk and recommend retention actions.', ['customer.profile', 'sales.metrics'], ['retention.recommendation'], ['marketing.automation', 'ai.next-best-action']),
  c('marketing.segmentation', 'marketing', 'Customer segmentation', 'Create dynamic segments from behavioral, transactional and lifecycle data.', ['customer.profile', 'analytics.events'], ['segment[]'], ['marketing.automation', 'customers.retention']),
  c('marketing.automation', 'marketing', 'Marketing automation', 'Run abandoned-cart, win-back, post-purchase, loyalty and lifecycle workflows.', ['segment[]', 'commerce.event'], ['marketing.job'], ['marketing.segmentation', 'customers.crm']),
  c('creative.ad-studio', 'creative', 'Ad Studio', 'Generate connected static/video creative variants using products, brand kits and campaign data.', ['product', 'brand.kit', 'campaign'], ['creative.asset[]'], ['creative.image-studio', 'marketing.campaigns']),
  c('creative.image-studio', 'creative', 'Image Studio', 'Generate, edit, upscale and vary product, lifestyle and branded images locally.', ['product', 'creative.asset'], ['creative.asset[]'], ['creative.ad-studio', 'storefront.builder']),
  c('marketing.campaigns', 'marketing', 'Campaign management', 'Plan, launch, measure and iterate marketing campaigns and creative experiments.', ['creative.asset[]', 'segment[]'], ['campaign.event'], ['creative.ad-studio', 'analytics.marketing']),
  c('storefront.builder', 'storefront', 'Store builder', 'Compose storefront pages, themes, navigation, merchandising and brand blocks.', ['product[]', 'brand.kit', 'content'], ['storefront.publish'], ['creative.image-studio', 'storefront.recommendations']),
  c('storefront.recommendations', 'storefront', 'Personalized merchandising', 'Recommend products, bundles and offers from catalog and customer behavior.', ['product[]', 'customer.profile', 'sales.metrics'], ['recommendation[]'], ['customers.crm', 'analytics.conversion']),
  c('storefront.stock-alerts', 'storefront', 'Stock and price alerts', 'Provide back-in-stock, price-drop and availability notifications.', ['inventory.event', 'price.event'], ['customer.notification'], ['inventory.sync', 'customers.notifications']),
  c('automation.workflow-engine', 'automation', 'Workflow engine', 'Execute event-driven automations with retries, schedules, approvals and audit trails.', ['domain.event'], ['workflow.event'], ['ai.workflow-agent', 'marketing.automation']),
  c('ai.merchant-brain', 'ai', 'Merchant Brain', 'Shared self-hosted reasoning layer over authorized commerce context.', ['authorized.context'], ['recommendation', 'draft.action'], ['ai.next-best-action', 'ai.business-health']),
  c('ai.next-best-action', 'ai', 'Next-best-action engine', 'Prioritize opportunities and risks across the entire merchant workspace.', ['analytics.*', 'commerce.*'], ['action.recommendation'], ['automation.workflow-engine']),
  c('ai.business-health', 'ai', 'Business health monitor', 'Continuously detect anomalies, losses, growth opportunities and operational risks.', ['analytics.*', 'finance.*', 'fulfillment.*'], ['health.alert'], ['ai.next-best-action', 'automation.workflow-engine']),
  c('analytics.unified', 'analytics', 'Unified analytics', 'Join storefront, product, customer, marketing, fulfillment and finance metrics.', ['domain.event[]'], ['analytics.snapshot'], ['ai.business-health', 'analytics.forecasting']),
  c('analytics.forecasting', 'analytics', 'Commerce forecasting', 'Forecast revenue, orders, margin, demand and operational load.', ['analytics.snapshot'], ['forecast[]'], ['inventory.forecasting', 'ai.business-health']),
  c('marketplace.connected', 'marketplace', 'Connected marketplace', 'Publish eligible merchant products without duplicating the canonical catalog or inventory.', ['product', 'inventory.event'], ['marketplace.listing'], ['payments.ts-pay', 'inventory.sync']),
  c('automation.approvals', 'automation', 'Approval center', 'Require human approval for sensitive or high-impact automated actions.', ['workflow.event', 'action.recommendation'], ['approval.event'], ['ai.merchant-brain', 'payments.ts-pay']),
  c('developer.webhooks', 'developer', 'Webhooks and event API', 'Expose stable domain events for merchants and internal integrations.', ['domain.event'], ['webhook.delivery'], ['automation.workflow-engine']),
  c('education.guide', 'education', 'TS Guide / Academy', 'Teach merchants using their actual store context, metrics and workflows.', ['authorized.context', 'learning.content'], ['learning.recommendation'], ['ai.merchant-brain']),
  c('services.commerce-suite', 'services', 'Commerce Suite', 'Connect digital products, courses, memberships, services, bookings, events and subscriptions to the same customer/order/finance core.', ['product', 'customer.profile', 'payment.event'], ['commerce.event'], ['payments.ts-pay', 'customers.crm', 'analytics.unified']),
];

export const LUNAVO_DOMAIN_EVENTS = [
  'product.created', 'product.updated', 'product.imported', 'inventory.changed',
  'cart.created', 'cart.abandoned', 'checkout.created', 'payment.created',
  'payment.verified', 'payment.failed', 'payment.refunded', 'order.created',
  'order.paid', 'order.cancelled', 'order.fulfilled', 'shipment.created',
  'shipment.tracking_updated', 'fulfillment.exception', 'customer.created',
  'customer.updated', 'campaign.created', 'campaign.performance_updated',
  'creative.generated', 'marketplace.listing_created', 'payout.requested',
  'payout.completed', 'subscription.paid', 'subscription.expired',
  'workflow.started', 'workflow.completed', 'ai.recommendation.created',
] as const;

export type LunavoDomainEvent = typeof LUNAVO_DOMAIN_EVENTS[number];

export function getCapabilitiesByDomain(domain: CapabilityDomain): Capability[] {
  return LUNAVO_CAPABILITIES.filter((item) => item.domain === domain);
}

export function getCapability(id: string): Capability | undefined {
  return LUNAVO_CAPABILITIES.find((item) => item.id === id);
}
