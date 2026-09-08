import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const autoDsSettingsTable = pgTable("auto_ds_settings", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  mode: text("mode").notNull().default("assisted"),
  autoAllocateSupplierCost: boolean("auto_allocate_supplier_cost").notNull().default(false),
  requireApprovalBeforeExternalOrder: boolean("require_approval_before_external_order").notNull().default(true),
  minimumMarginPercent: numeric("minimum_margin_percent", { precision: 8, scale: 2 }).notNull().default("10"),
  defaultCarrier: text("default_carrier"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const fulfillmentJobsTable = pgTable("fulfillment_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  orderId: integer("order_id").notNull(),
  supplierProductId: integer("supplier_product_id"),
  mode: text("mode").notNull().default("assisted"),
  status: text("status").notNull().default("ready"),
  supplierOrderReference: text("supplier_order_reference"),
  supplierCheckoutUrl: text("supplier_checkout_url"),
  customerSnapshot: jsonb("customer_snapshot").notNull().default({}),
  costMinor: integer("cost_minor"),
  currency: text("currency"),
  lastError: text("last_error"),
  attempts: integer("attempts").notNull().default(0),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("fulfillment_jobs_order_unique").on(table.orderId),
  uniqueIndex("fulfillment_jobs_idempotency_unique").on(table.merchantId, table.idempotencyKey),
]);

export const customerWishlistsTable = pgTable("customer_wishlists", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  customerId: integer("customer_id").notNull(),
  supplierProductId: integer("supplier_product_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("customer_wishlist_unique").on(table.merchantId, table.customerId, table.supplierProductId),
]);

export const customerSavedCartsTable = pgTable("customer_saved_carts", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  customerId: integer("customer_id").notNull(),
  name: text("name").notNull().default("Saved cart"),
  cartSnapshot: jsonb("cart_snapshot").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("customer_saved_cart_name_unique").on(table.merchantId, table.customerId, table.name),
]);

export const discountCodesTable = pgTable("discount_codes", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  code: text("code").notNull(),
  kind: text("kind").notNull().default("percentage"),
  value: numeric("value", { precision: 12, scale: 2 }).notNull(),
  minimumSubtotal: numeric("minimum_subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: text("currency"),
  usageLimit: integer("usage_limit"),
  usageCount: integer("usage_count").notNull().default(0),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("discount_codes_merchant_code_unique").on(table.merchantId, table.code),
]);

export const giftCardsTable = pgTable("gift_cards", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  codeHash: text("code_hash").notNull(),
  codeLast4: text("code_last4").notNull(),
  initialAmountMinor: integer("initial_amount_minor").notNull(),
  balanceMinor: integer("balance_minor").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  recipientEmail: text("recipient_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("gift_cards_code_hash_unique").on(table.codeHash),
]);

export const loyaltyAccountsTable = pgTable("loyalty_accounts", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  customerId: integer("customer_id").notNull(),
  pointsBalance: integer("points_balance").notNull().default(0),
  lifetimePoints: integer("lifetime_points").notNull().default(0),
  tier: text("tier").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("loyalty_accounts_customer_unique").on(table.merchantId, table.customerId),
]);

export const loyaltyTransactionsTable = pgTable("loyalty_transactions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  customerId: integer("customer_id").notNull(),
  orderId: integer("order_id"),
  pointsDelta: integer("points_delta").notNull(),
  reason: text("reason").notNull(),
  referenceKey: text("reference_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("loyalty_transactions_reference_unique").on(table.referenceKey),
]);

export const affiliateOffersTable = pgTable("affiliate_offers", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  supplierProductId: integer("supplier_product_id").notNull(),
  status: text("status").notNull().default("review"),
  commissionBps: integer("commission_bps").notNull().default(3000),
  destinationUrl: text("destination_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("affiliate_offers_product_unique").on(table.merchantId, table.supplierProductId),
]);

export const affiliateClicksTable = pgTable("affiliate_clicks", {
  id: uuid("id").defaultRandom().primaryKey(),
  offerId: integer("offer_id").notNull(),
  affiliateKey: text("affiliate_key").notNull(),
  sessionKey: text("session_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const affiliateConversionsTable = pgTable("affiliate_conversions", {
  id: uuid("id").defaultRandom().primaryKey(),
  offerId: integer("offer_id").notNull(),
  orderId: integer("order_id"),
  affiliateKey: text("affiliate_key").notNull(),
  commissionMinor: integer("commission_minor").notNull().default(0),
  currency: text("currency").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const digitalProductsTable = pgTable("digital_products", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  supplierProductId: integer("supplier_product_id"),
  kind: text("kind").notNull().default("digital"),
  accessMode: text("access_mode").notNull().default("purchase"),
  dripEnabled: boolean("drip_enabled").notNull().default(false),
  certificateEnabled: boolean("certificate_enabled").notNull().default(false),
  curriculumPublic: boolean("curriculum_public").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const digitalAssetsTable = pgTable("digital_assets", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  digitalProductId: integer("digital_product_id").notNull(),
  title: text("title").notNull(),
  assetType: text("asset_type").notNull(),
  storageKey: text("storage_key"),
  externalUrl: text("external_url"),
  downloadable: boolean("downloadable").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const courseSectionsTable = pgTable("course_sections", {
  id: serial("id").primaryKey(),
  digitalProductId: integer("digital_product_id").notNull(),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const courseLessonsTable = pgTable("course_lessons", {
  id: serial("id").primaryKey(),
  sectionId: integer("section_id").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  videoUrl: text("video_url"),
  durationSeconds: integer("duration_seconds"),
  preview: boolean("preview").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const customerEntitlementsTable = pgTable("customer_entitlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  customerId: integer("customer_id").notNull(),
  digitalProductId: integer("digital_product_id").notNull(),
  orderId: integer("order_id"),
  status: text("status").notNull().default("active"),
  progressPercent: integer("progress_percent").notNull().default(0),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("customer_entitlement_unique").on(table.merchantId, table.customerId, table.digitalProductId),
]);
