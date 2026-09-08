/**
 * Self-hosted frontier capabilities for TS Commerce.
 *
 * This registry is deliberately dependency-free. It describes capabilities that
 * can be implemented with local models, PostgreSQL, local workers/queues,
 * local object storage and deterministic application logic. It must never be
 * treated as proof that a capability is currently enabled in production.
 */

export type FrontierRisk = 'observe' | 'prepare' | 'approve';

export type FrontierCapability = {
  id: string;
  name: string;
  description: string;
  risk: FrontierRisk;
  moneyMoving: false;
  externalApiKeyRequired: false;
};

export const LOCAL_COMMERCE_FRONTIER: readonly FrontierCapability[] = [
  { id: 'commerce-time-machine', name: 'Commerce Time Machine', description: 'Replay persisted business signals and compare alternative decisions against historical state.', risk: 'observe', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'business-simulator', name: 'Business Simulator', description: 'Run deterministic what-if scenarios for price, discount, supplier, inventory, hiring and campaigns.', risk: 'prepare', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'product-resurrection', name: 'Product Resurrection', description: 'Detect dormant products with recoverable demand and prepare a recovery plan.', risk: 'prepare', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'supplier-twin', name: 'Supplier Twin', description: 'Build a local supplier reliability fingerprint from fulfilled orders and exceptions.', risk: 'observe', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'profit-firewall', name: 'Profit Firewall', description: 'Detect margin leakage from costs, fees, refunds, discounts and pricing decisions.', risk: 'observe', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'store-genome', name: 'Store Genome', description: 'Create a private structural fingerprint of catalog, pricing, conversion and retention patterns.', risk: 'observe', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'store-surgeon', name: 'AI Store Surgeon', description: 'Diagnose weak storefront journeys and prepare reversible repair plans.', risk: 'prepare', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'research-swarm', name: 'Local Research Swarm', description: 'Split research into specialist local jobs for demand, competition, suppliers, SEO and economics.', risk: 'prepare', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'commerce-radar', name: 'Commerce Radar', description: 'Watch for demand shifts, stock pressure, supplier deterioration and anomalous orders.', risk: 'observe', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'customer-journey-simulator', name: 'Customer Journey Simulator', description: 'Test checkout, retention and upsell journeys against persisted behavioural aggregates.', risk: 'prepare', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'catalog-doctor', name: 'Automatic Catalog Doctor', description: 'Find duplicate SKUs, missing attributes, inconsistent variants and risky claims.', risk: 'prepare', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'incident-center', name: 'Autonomous Incident Center', description: 'Correlate operational failures into incidents and propose recovery sequences.', risk: 'prepare', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'local-ai-memory', name: 'Local AI Memory', description: 'Persist merchant-approved context in the platform database for continuity.', risk: 'observe', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'command-language', name: 'Merchant Command Language', description: 'Convert plain-language goals into reviewable, scoped workflow plans.', risk: 'approve', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'business-launcher', name: 'One-Click Business Launch', description: 'Assemble a store blueprint, catalog structure, brand brief and launch checklist.', risk: 'prepare', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'digital-business-twin', name: 'Digital Business Twin', description: 'Maintain a local model for decision experiments before production changes.', risk: 'observe', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'decision-replay', name: 'Decision Replay', description: 'Explain recommendation evidence, assumptions and resulting decisions.', risk: 'observe', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'emergency-commerce-mode', name: 'Emergency Commerce Mode', description: 'Pause risky automation while preserving verified payment and ledger records.', risk: 'approve', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'autonomous-merchandising', name: 'Autonomous Merchandising Lab', description: 'Prepare collection ordering, bundles and merchandising experiments for approval.', risk: 'approve', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'demand-gravity-map', name: 'Demand Gravity Map', description: 'Map product demand concentration and emerging opportunities from local commerce data.', risk: 'observe', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'margin-escape-room', name: 'Margin Escape Room', description: 'Trace a profit leak backwards through product cost, shipping, discount, provider fee and refund events.', risk: 'observe', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'failure-predictor', name: 'Failure Predictor', description: 'Score operational patterns that historically precede stockouts, late fulfillment or order exceptions.', risk: 'observe', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'experiment-orchestrator', name: 'Experiment Orchestrator', description: 'Design controlled storefront experiments with explicit hypotheses, metrics and rollback criteria.', risk: 'prepare', moneyMoving: false, externalApiKeyRequired: false },
  { id: 'business-autopilot', name: 'Business Autopilot', description: 'Coordinate approved local workflows while respecting risk gates and deterministic financial rules.', risk: 'approve', moneyMoving: false, externalApiKeyRequired: false },
] as const;

export function getLocalCommerceFrontier(): readonly FrontierCapability[] {
  return LOCAL_COMMERCE_FRONTIER;
}

export function assertSelfHostedFrontier(capability: FrontierCapability): void {
  if (capability.moneyMoving) throw new Error(`Frontier capability ${capability.id} cannot move money.`);
  if (capability.externalApiKeyRequired) throw new Error(`Frontier capability ${capability.id} cannot require an external API key.`);
}
