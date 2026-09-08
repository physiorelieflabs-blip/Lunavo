import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Durable sourcing intelligence. Supplier credentials are never stored here. */
export const sourcingSourcesTable = pgTable("sourcing_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: integer("merchant_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  canonicalUrl: text("canonical_url"),
  domain: text("domain"),
  sourceType: text("source_type").notNull().default("product_url"),
  status: text("status").notNull().default("active"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [index("sourcing_sources_merchant_idx").on(table.merchantId, table.status)]);

export const sourcingProductsTable = pgTable("sourcing_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: integer("merchant_id").notNull(),
  sourceId: uuid("source_id").notNull(),
  sourceProductKey: text("source_product_key"),
  title: text("title").notNull(),
  description: text("description"),
  sourceCurrency: text("source_currency"),
  sourcePriceMinor: integer("source_price_minor"),
  sourceAvailability: text("source_availability"),
  sourceSku: text("source_sku"),
  variants: jsonb("variants").notNull().default([]),
  media: jsonb("media").notNull().default([]),
  specifications: jsonb("specifications").notNull().default({}),
  normalizedData: jsonb("normalized_data").notNull().default({}),
  qualityScore: integer("quality_score"),
  opportunityScore: integer("opportunity_score"),
  status: text("status").notNull().default("review"),
  importedProductId: integer("imported_product_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("sourcing_products_merchant_status_idx").on(table.merchantId, table.status),
  index("sourcing_products_opportunity_idx").on(table.merchantId, table.opportunityScore),
]);

export const sourcingPriceSnapshotsTable = pgTable("sourcing_price_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourcingProductId: uuid("sourcing_product_id").notNull(),
  sourcePriceMinor: integer("source_price_minor").notNull(),
  currency: text("currency").notNull(),
  availability: text("availability"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("sourcing_price_snapshots_product_time_idx").on(table.sourcingProductId, table.capturedAt)]);

/** Paid General Store exposure. Creating a campaign never marks it paid. */
export const productAdvertisingCampaignsTable = pgTable("product_advertising_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: integer("merchant_id").notNull(),
  storeId: uuid("store_id"),
  productId: integer("product_id").notNull(),
  feeMinor: integer("fee_minor").notNull().default(500),
  currency: text("currency").notNull().default("USD"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  paymentTransactionId: integer("payment_transaction_id"),
  paymentReference: text("payment_reference"),
  status: text("status").notNull().default("draft"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  budgetMinor: integer("budget_minor"),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  productViews: integer("product_views").notNull().default(0),
  addToCarts: integer("add_to_carts").notNull().default(0),
  purchases: integer("purchases").notNull().default(0),
  attributedRevenueMinor: integer("attributed_revenue_minor").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("product_ads_merchant_status_idx").on(table.merchantId, table.status),
  index("product_ads_product_status_idx").on(table.productId, table.status),
]);

export const marketplaceDiscoveryEventsTable = pgTable("marketplace_discovery_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: integer("product_id").notNull(),
  campaignId: uuid("campaign_id"),
  customerId: integer("customer_id"),
  eventType: text("event_type").notNull(),
  sessionKey: text("session_key"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("marketplace_events_product_time_idx").on(table.productId, table.createdAt), index("marketplace_events_campaign_idx").on(table.campaignId)]);

export const commerceGrowthOpportunitiesTable = pgTable("commerce_growth_opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: integer("merchant_id").notNull(),
  type: text("type").notNull(),
  priority: text("priority").notNull().default("medium"),
  score: integer("score"),
  title: text("title").notNull(),
  explanation: text("explanation").notNull(),
  evidence: jsonb("evidence").notNull().default([]),
  suggestedAction: jsonb("suggested_action").notNull().default({}),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (table) => [index("growth_opportunities_merchant_status_idx").on(table.merchantId, table.status)]);

export const storeHealthChecksTable = pgTable("store_health_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: integer("merchant_id").notNull(),
  score: integer("score").notNull(),
  checks: jsonb("checks").notNull().default([]),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("store_health_checks_merchant_time_idx").on(table.merchantId, table.generatedAt)]);

export const insertSourcingSourceSchema = createInsertSchema(sourcingSourcesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSourcingProductSchema = createInsertSchema(sourcingProductsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAdvertisingCampaignSchema = createInsertSchema(productAdvertisingCampaignsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDiscoveryEventSchema = createInsertSchema(marketplaceDiscoveryEventsTable).omit({ id: true, createdAt: true });
export type SourcingSource = typeof sourcingSourcesTable.$inferSelect;
export type SourcingProduct = typeof sourcingProductsTable.$inferSelect;
export type AdvertisingCampaign = typeof productAdvertisingCampaignsTable.$inferSelect;
export type DiscoveryEvent = typeof marketplaceDiscoveryEventsTable.$inferSelect;
export type GrowthOpportunity = typeof commerceGrowthOpportunitiesTable.$inferSelect;
export type StoreHealthCheck = typeof storeHealthChecksTable.$inferSelect;
