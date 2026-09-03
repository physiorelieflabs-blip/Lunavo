import {
  boolean,
  date,
  index,
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
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commerceMigrationsTable = pgTable("_ts_commerce_migrations", {
  id: text("id").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const merchantsTable = pgTable("merchants", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  storeName: text("store_name").notNull(),
  storeDescription: text("store_description"),
  storeContactEmail: text("store_contact_email"),
  storePhone: text("store_phone"),
  storeWebsite: text("store_website"),
  storeAddress: jsonb("store_address"),
  currency: text("currency").notNull().default("USD"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  shippingFee: numeric("shipping_fee", { precision: 12, scale: 2 }).notNull().default("0"),
  freeShippingThreshold: numeric("free_shipping_threshold", { precision: 12, scale: 2 }),
  status: text("status").notNull().default("active"),
  registeredAt: timestamp("registered_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Physical and operational sites are tenant-owned. A location is never
 * inferred from a client supplied merchant id; services resolve it through
 * the authenticated membership's merchant id.
 */
export const merchantLocationsTable = pgTable(
  "merchant_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
    name: text("name").notNull(),
    locationType: text("location_type").notNull().default("store"),
    country: text("country").notNull(),
    currency: text("currency").notNull(),
    timezone: text("timezone").notNull(),
    address: jsonb("address").notNull().default({}),
    contact: jsonb("contact").notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    supportsFulfillment: boolean("supports_fulfillment").notNull().default(false),
    supportsPos: boolean("supports_pos").notNull().default(false),
    supportsInventory: boolean("supports_inventory").notNull().default(false),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("merchant_locations_merchant_active_idx").on(table.merchantId, table.isActive),
    uniqueIndex("merchant_locations_one_default_unique").on(table.merchantId).where(sql`${table.isDefault}`),
  ],
);

/** Tenant-local roles. Built-in template keys are immutable at the service layer. */
export const merchantRolesTable = pgTable(
  "merchant_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("merchant_roles_merchant_key_unique").on(table.merchantId, table.key)],
);

/** Explicit keys rather than implicit role names make authorization auditable. */
export const merchantRolePermissionsTable = pgTable(
  "merchant_role_permissions",
  {
    roleId: uuid("role_id").notNull().references(() => merchantRolesTable.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("merchant_role_permissions_role_permission_unique").on(table.roleId, table.permission)],
);

export const merchantMembershipsTable = pgTable(
  "merchant_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
    clerkUserId: text("clerk_user_id").notNull(),
    roleId: uuid("role_id").notNull().references(() => merchantRolesTable.id),
    status: text("status").notNull().default("active"),
    invitedBy: text("invited_by"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("merchant_memberships_merchant_clerk_user_unique").on(table.merchantId, table.clerkUserId),
    index("merchant_memberships_clerk_status_idx").on(table.clerkUserId, table.status),
  ],
);

export const merchantMembershipLocationsTable = pgTable(
  "merchant_membership_locations",
  {
    membershipId: uuid("membership_id").notNull().references(() => merchantMembershipsTable.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull().references(() => merchantLocationsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("merchant_membership_locations_unique").on(table.membershipId, table.locationId)],
);

/** Token values are deliberately absent: only a SHA-256 hash is durable. */
export const merchantInvitationsTable = pgTable(
  "merchant_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
    email: text("email").notNull(),
    roleId: uuid("role_id").notNull().references(() => merchantRolesTable.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    invitedBy: text("invited_by").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    acceptedBy: text("accepted_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("merchant_invitations_merchant_email_idx").on(table.merchantId, table.email),
    uniqueIndex("merchant_invitations_active_email_unique")
      .on(table.merchantId, table.email)
      .where(sql`${table.acceptedAt} IS NULL AND ${table.revokedAt} IS NULL`),
  ],
);

export const merchantInvitationLocationsTable = pgTable(
  "merchant_invitation_locations",
  {
    invitationId: uuid("invitation_id").notNull().references(() => merchantInvitationsTable.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull().references(() => merchantLocationsTable.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("merchant_invitation_locations_unique").on(table.invitationId, table.locationId)],
);

export const subscriptionsTable = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchantsTable.id),
    amountDue: numeric("amount_due", { precision: 12, scale: 2 })
      .notNull()
      .default("30"),
    baseAmountUsd: numeric("base_amount_usd", { precision: 12, scale: 2 })
      .notNull()
      .default("30"),
    currency: text("currency").notNull().default("USD"),
    fxRate: numeric("fx_rate", { precision: 18, scale: 8 })
      .notNull()
      .default("1"),
    fxSource: text("fx_source").notNull().default("Identity rate"),
    fxAsOf: timestamp("fx_as_of", { withTimezone: true }),
    amountPaid: numeric("amount_paid", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    earningsHeld: numeric("earnings_held", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    billingTimezone: text("billing_timezone"),
    status: text("status").notNull().default("pending"),
    paymentMethod: text("payment_method"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("subscriptions_merchant_id_unique").on(table.merchantId),
  ],
);

export const paymentsTable = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchantsTable.id),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    method: text("method").notNull(),
    reference: text("reference").notNull(),
    evidenceReference: text("evidence_reference"),
    senderName: text("sender_name"),
    status: text("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by"),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("payments_reference_unique").on(
      sql`upper(btrim(${table.reference}))`,
    ),
  ],
);

export const activityTable = pgTable("activity", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id")
    .notNull()
    .references(() => merchantsTable.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  currency: text("currency").notNull().default("USD"),
  tone: text("tone").notNull().default("neutral"),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Transactional outbox. Events record facts after their authoritative
 * mutation has succeeded; they are not a financial or inventory source of
 * truth. Payloads are deliberately internal and must be redacted by API
 * serializers before being returned to a merchant.
 */
export const domainEventsTable = pgTable(
  "domain_events",
  {
    id: uuid("id").primaryKey(),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
    eventType: text("event_type").notNull(),
    payloadVersion: integer("payload_version").notNull().default(1),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    source: text("source").notNull(),
    correlationId: uuid("correlation_id"),
    causationId: uuid("causation_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    payload: jsonb("payload").notNull().default({}),
    context: jsonb("context").notNull().default({}),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("domain_events_merchant_idempotency_unique").on(table.merchantId, table.idempotencyKey),
    index("domain_events_dispatch_idx").on(table.status, table.nextAttemptAt),
    index("domain_events_merchant_occurred_idx").on(table.merchantId, table.occurredAt),
  ],
);

export const domainEventConsumptionsTable = pgTable(
  "domain_event_consumptions",
  {
    id: serial("id").primaryKey(),
    eventId: uuid("event_id").notNull().references(() => domainEventsTable.id),
    consumer: text("consumer").notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("domain_event_consumptions_event_consumer_unique").on(table.eventId, table.consumer)],
);

export const notificationsTable = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey(),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
    recipientType: text("recipient_type").notNull().default("merchant"),
    recipientId: text("recipient_id"),
    actorType: text("actor_type"),
    actorId: text("actor_id"),
    eventId: uuid("event_id").references(() => domainEventsTable.id),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    deepLink: text("deep_link"),
    actionLabel: text("action_label"),
    severity: text("severity").notNull().default("info"),
    dedupeKey: text("dedupe_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("notifications_merchant_dedupe_unique").on(table.merchantId, table.dedupeKey),
    index("notifications_merchant_created_idx").on(table.merchantId, table.createdAt),
  ],
);

/** Records a trigger only; it never implies an automation action was run. */
export const automationEventHooksTable = pgTable(
  "automation_event_hooks",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
    eventId: uuid("event_id").notNull().references(() => domainEventsTable.id),
    status: text("status").notNull().default("observed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("automation_event_hooks_event_unique").on(table.eventId)],
);

export const customersTable = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchantsTable.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    notes: text("notes"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    consentCapturedAt: timestamp("consent_captured_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("customers_merchant_email_unique").on(
      table.merchantId,
      table.email,
    ),
  ],
);

export const suppliersTable = pgTable(
  "suppliers",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchantsTable.id),
    name: text("name").notNull(),
    website: text("website").notNull(),
    domain: text("domain").notNull(),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    category: text("category"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("suppliers_merchant_domain_unique").on(
      table.merchantId,
      table.domain,
    ),
  ],
);

export const supplierImportBatchesTable = pgTable("supplier_import_batches", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id")
    .notNull()
    .references(() => merchantsTable.id),
  status: text("status").notNull().default("analyzing"),
  sourceCount: integer("source_count").notNull().default(0),
  completedCount: integer("completed_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const supplierProductsTable = pgTable(
  "supplier_products",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchantsTable.id),
    supplierId: integer("supplier_id").references(() => suppliersTable.id),
    sourceUrl: text("source_url").notNull(),
    supplierUrl: text("supplier_url").notNull(),
    sourceDomain: text("source_domain").notNull(),
    sourceProductId: text("source_product_id"),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    imageUrls: jsonb("image_urls"),
    videoUrls: jsonb("video_urls"),
    price: numeric("price", { precision: 12, scale: 2 }),
    salePrice: numeric("sale_price", { precision: 12, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    sku: text("sku"),
    variants: jsonb("variants"),
    attributes: jsonb("attributes"),
    availability: text("availability"),
    availabilityQuantity: integer("availability_quantity"),
    inventoryStrategy: text("inventory_strategy").notNull().default("source_based"),
    inventoryStatus: text("inventory_status").notNull().default("unknown"),
    category: text("category"),
    tags: jsonb("tags"),
    specifications: jsonb("specifications"),
    brand: text("brand"),
    shippingInformation: jsonb("shipping_information"),
    taxConfiguration: jsonb("tax_configuration"),
    shippingConfiguration: jsonb("shipping_configuration"),
    seoConfiguration: jsonb("seo_configuration"),
    sourceMetadata: jsonb("source_metadata"),
    merchantOverrides: jsonb("merchant_overrides"),
    profitType: text("profit_type").notNull().default("fixed"),
    pricingMode: text("pricing_mode").notNull().default("fixed_markup"),
    profitValue: numeric("profit_value", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    sellingPrice: numeric("selling_price", { precision: 12, scale: 2 }),
    visibility: text("visibility").notNull().default("draft"),
    marketplaceVisibility: boolean("marketplace_visibility").notNull().default(false),
    status: text("status").notNull().default("draft"),
    importStatus: text("import_status").notNull().default("imported"),
    importError: text("import_error"),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastAttemptedSync: timestamp("last_attempted_sync", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);

export const inventoryReservationsTable = pgTable(
  "inventory_reservations",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
    supplierProductId: integer("supplier_product_id").notNull().references(() => supplierProductsTable.id),
    orderId: integer("order_id").notNull().references(() => ordersTable.id),
    // Product stock remains merchant-global; this is event provenance only.
    locationId: uuid("location_id").references(() => merchantLocationsTable.id),
    quantity: integer("quantity").notNull(),
    status: text("status").notNull().default("reserved"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("inventory_reservations_active_order_product_unique")
      .on(table.orderId, table.supplierProductId)
      .where(sql`${table.status} = 'reserved'`),
    index("inventory_reservations_merchant_product_idx").on(table.merchantId, table.supplierProductId),
    index("inventory_reservations_merchant_location_idx").on(table.merchantId, table.locationId),
  ],
);

export const inventoryMovementsTable = pgTable(
  "inventory_movements",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
    supplierProductId: integer("supplier_product_id").notNull().references(() => supplierProductsTable.id),
    orderId: integer("order_id").references(() => ordersTable.id),
    // Product stock remains merchant-global; this is event provenance only.
    locationId: uuid("location_id").references(() => merchantLocationsTable.id),
    quantityDelta: integer("quantity_delta").notNull(),
    reason: text("reason").notNull(),
    referenceKey: text("reference_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_movements_reference_unique").on(table.referenceKey),
    index("inventory_movements_merchant_product_idx").on(table.merchantId, table.supplierProductId),
    index("inventory_movements_merchant_location_idx").on(table.merchantId, table.locationId),
  ],
);

export const supplierImportAttemptsTable = pgTable("supplier_import_attempts", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id")
    .notNull()
    .references(() => merchantsTable.id),
  supplierProductId: integer("supplier_product_id").references(
    () => supplierProductsTable.id,
  ),
  batchId: integer("batch_id").references(() => supplierImportBatchesTable.id),
  sourceUrl: text("source_url").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  changes: jsonb("changes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ordersTable = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchantsTable.id),
    locationId: uuid("location_id").notNull().references(() => merchantLocationsTable.id),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customersTable.id),
    orderNumber: text("order_number").notNull(),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    shippingAmount: numeric("shipping_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("paid"),
    supplierProductId: integer("supplier_product_id").references(
      () => supplierProductsTable.id,
    ),
    shippingAddress: text("shipping_address"),
    fulfillmentStatus: text("fulfillment_status")
      .notNull()
      .default("not_applicable"),
    supplierOrderReference: text("supplier_order_reference"),
    trackingNumber: text("tracking_number"),
    fulfillmentNote: text("fulfillment_note"),
    fulfillmentSubmittedAt: timestamp("fulfillment_submitted_at", {
      withTimezone: true,
    }),
    fulfillmentUpdatedAt: timestamp("fulfillment_updated_at", {
      withTimezone: true,
    }),
    supplierPaymentStatus: text("supplier_payment_status").notNull().default("unpaid"),
    supplierPaymentReference: text("supplier_payment_reference"),
    supplierPaymentAmountMinor: integer("supplier_payment_amount_minor"),
    supplierPaidAt: timestamp("supplier_paid_at", { withTimezone: true }),
    publicPaymentToken: text("public_payment_token").unique(),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("orders_merchant_order_number_unique").on(
      table.merchantId,
      table.orderNumber,
    ),
    uniqueIndex("orders_merchant_idempotency_unique").on(
      table.merchantId,
      table.idempotencyKey,
    ),
    index("orders_merchant_location_created_idx").on(table.merchantId, table.locationId, table.createdAt),
  ],
);

export const paymentLinksTable = pgTable(
  "payment_links",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
    token: text("token").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payment_links_merchant_status_idx").on(table.merchantId, table.status),
  ],
);

/**
 * Invoices are tenant-owned commercial documents. Monetary fields are stored
 * as document snapshots: a later merchant currency or tax-rule change must
 * never alter a previously issued invoice.
 */
export const invoicesTable = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
    locationId: uuid("location_id").notNull().references(() => merchantLocationsTable.id),
    customerId: integer("customer_id").references(() => customersTable.id),
    orderId: integer("order_id").references(() => ordersTable.id),
    paymentLinkId: integer("payment_link_id").references(() => paymentLinksTable.id),
    invoiceNumber: text("invoice_number").notNull(),
    publicToken: text("public_token").notNull().unique(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone"),
    billingAddress: jsonb("billing_address"),
    shippingAddress: jsonb("shipping_address"),
    currency: text("currency").notNull(),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    shippingAmount: numeric("shipping_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull().default("0"),
    dueDate: date("due_date", { mode: "string" }),
    status: text("status").notNull().default("draft"),
    notes: text("notes"),
    terms: text("terms"),
    paymentReference: text("payment_reference"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("invoices_merchant_number_unique").on(table.merchantId, table.invoiceNumber),
    index("invoices_merchant_status_created_idx").on(table.merchantId, table.status, table.createdAt),
    index("invoices_merchant_location_created_idx").on(table.merchantId, table.locationId, table.createdAt),
    index("invoices_public_token_idx").on(table.publicToken),
  ],
);

export const invoiceLinesTable = pgTable(
  "invoice_lines",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("invoice_lines_invoice_position_unique").on(table.invoiceId, table.position),
    index("invoice_lines_invoice_idx").on(table.invoiceId),
  ],
);

/**
 * A customer-provided reference is evidence awaiting review, never evidence
 * of card capture or settled funds. Only a merchant verification flow may
 * mark an entry verified and affect invoice payment state.
 */
export const invoicePaymentSubmissionsTable = pgTable(
  "invoice_payment_submissions",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    paymentReference: text("payment_reference").notNull(),
    senderName: text("sender_name"),
    status: text("status").notNull().default("pending_review"),
    reviewNote: text("review_note"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("invoice_payment_submissions_reference_unique").on(
      sql`upper(btrim(${table.paymentReference}))`,
    ),
    index("invoice_payment_submissions_invoice_status_idx").on(table.invoiceId, table.status),
  ],
);

export const marketplaceListingsTable = pgTable(
  "marketplace_listings",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
    supplierProductId: integer("supplier_product_id").notNull().references(() => supplierProductsTable.id),
    status: text("status").notNull().default("pending"),
    reviewNote: text("review_note"),
    listingFeeAmount: numeric("listing_fee_amount", { precision: 12, scale: 2 }).notNull().default("5"),
    listingFeeCurrency: text("listing_fee_currency").notNull().default("USD"),
    listingFeeStatus: text("listing_fee_status").notNull().default("due"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("marketplace_listings_merchant_product_unique").on(table.merchantId, table.supplierProductId),
    index("marketplace_listings_merchant_status_idx").on(table.merchantId, table.status),
  ],
);

export const marketplaceBillingRecordsTable = pgTable(
  "marketplace_billing_records",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
    listingId: integer("listing_id").references(() => marketplaceListingsTable.id),
    kind: text("kind").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("due"),
    paymentReference: text("payment_reference"),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (table) => [
    index("marketplace_billing_merchant_created_idx").on(table.merchantId, table.createdAt),
  ],
);

export const auctionListingsTable = pgTable(
  "auction_listings",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
    supplierProductId: integer("supplier_product_id").notNull().references(() => supplierProductsTable.id),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    currency: text("currency").notNull(),
    startingPrice: numeric("starting_price", { precision: 12, scale: 2 }).notNull(),
    reservePrice: numeric("reserve_price", { precision: 12, scale: 2 }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("auction_listings_merchant_status_idx").on(table.merchantId, table.status),
    index("auction_listings_status_ends_idx").on(table.status, table.endsAt),
  ],
);

export const auctionBidsTable = pgTable(
  "auction_bids",
  {
    id: serial("id").primaryKey(),
    auctionId: integer("auction_id").notNull().references(() => auctionListingsTable.id, { onDelete: "cascade" }),
    bidderName: text("bidder_name").notNull(),
    bidderEmail: text("bidder_email").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("auction_bids_auction_amount_idx").on(table.auctionId, table.amount),
    index("auction_bids_email_created_idx").on(table.bidderEmail, table.createdAt),
  ],
);

export const aiModelsTable = pgTable(
  "ai_models",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchantsTable.id),
    name: text("name").notNull(),
    version: text("version").notNull(),
    modelType: text("model_type").notNull(),
    status: text("status").notNull().default("untrained"),
    trainingExamples: integer("training_examples").notNull().default(0),
    evaluationScore: numeric("evaluation_score", { precision: 5, scale: 4 }),
    weights: jsonb("weights"),
    trainedAt: timestamp("trained_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_models_merchant_name_version_unique").on(
      table.merchantId,
      table.name,
      table.version,
    ),
  ],
);

export const aiSettingsTable = pgTable(
  "ai_settings",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchantsTable.id),
    autonomyLevel: integer("autonomy_level").notNull().default(1),
    runMyBusiness: boolean("run_my_business").notNull().default(false),
    trainingOptIn: boolean("training_opt_in").notNull().default(true),
    goal: text("goal"),
    goalTarget: numeric("goal_target", { precision: 12, scale: 2 }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("ai_settings_merchant_id_unique").on(table.merchantId),
  ],
);

export const aiActionsTable = pgTable("ai_actions", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id")
    .notNull()
    .references(() => merchantsTable.id),
  agent: text("agent").notNull(),
  actionType: text("action_type").notNull(),
  title: text("title").notNull(),
  reason: text("reason").notNull(),
  dataUsed: jsonb("data_used"),
  result: jsonb("result"),
  status: text("status").notNull().default("awaiting_approval"),
  risk: text("risk").notNull().default("low"),
  reversible: boolean("reversible").notNull().default(true),
  approvalRequired: boolean("approval_required").notNull().default(true),
  rollbackAvailable: boolean("rollback_available").notNull().default(true),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const advertisingPaymentsTable = pgTable(
  "advertising_payments",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchantsTable.id),
    aiActionId: integer("ai_action_id")
      .notNull()
      .references(() => aiActionsTable.id),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    method: text("method").notNull(),
    status: text("status").notNull().default("pending_review"),
    paymentReference: text("payment_reference"),
    idempotencyKey: text("idempotency_key").notNull(),
    reviewedBy: text("reviewed_by"),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("advertising_payments_idempotency_unique").on(
      table.idempotencyKey,
    ),
    uniqueIndex("advertising_payments_reference_unique").on(
      sql`upper(btrim(${table.paymentReference}))`,
    ),
    index("advertising_payments_merchant_created_idx").on(
      table.merchantId,
      table.createdAt,
    ),
    index("advertising_payments_action_status_idx").on(
      table.aiActionId,
      table.status,
    ),
  ],
);

export const merchantBankAccountsTable = pgTable(
  "merchant_bank_accounts",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchantsTable.id),
    beneficiaryName: text("beneficiary_name").notNull(),
    bankName: text("bank_name").notNull(),
    bankCode: text("bank_code").notNull(),
    accountNumberCiphertext: text("account_number_ciphertext").notNull(),
    accountLast4: text("account_last4").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("merchant_bank_accounts_merchant_id_unique").on(
      table.merchantId,
    ),
  ],
);

export const withdrawalSecurityTable = pgTable(
  "withdrawal_security",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchantsTable.id),
    totpSecretCiphertext: text("totp_secret_ciphertext"),
    pendingTotpSecretCiphertext: text("pending_totp_secret_ciphertext"),
    pendingTotpExpiresAt: timestamp("pending_totp_expires_at", {
      withTimezone: true,
    }),
    merchantPinHashes: jsonb("merchant_pin_hashes").notNull().default([]),
    adminPinHashes: jsonb("admin_pin_hashes").notNull().default([]),
    enabledAt: timestamp("enabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("withdrawal_security_merchant_id_unique").on(table.merchantId),
  ],
);

export const withdrawalsTable = pgTable(
  "withdrawals",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchantsTable.id),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("pending"),
    beneficiaryName: text("beneficiary_name").notNull(),
    bankName: text("bank_name").notNull(),
    destinationCiphertext: text("destination_ciphertext").notNull(),
    accountLast4: text("account_last4").notNull(),
    idempotencyKey: text("idempotency_key"),
    reviewedBy: text("reviewed_by"),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("withdrawals_merchant_idempotency_unique").on(
      table.merchantId,
      table.idempotencyKey,
    ),
  ],
);

/**
 * Authoritative commerce accounting records. Amounts are integer minor units;
 * the currency column is intentionally stored on every record so historical
 * values are never re-labelled when a merchant changes currency.
 */
export const paymentIntentsTable = pgTable(
  "payment_intents",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
    orderId: integer("order_id").references(() => ordersTable.id),
    invoicePaymentSubmissionId: integer("invoice_payment_submission_id").references(() => invoicePaymentSubmissionsTable.id),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    method: text("method").notNull(),
    status: text("status").notNull().default("created"),
    idempotencyKey: text("idempotency_key").notNull(),
    evidenceReference: text("evidence_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("payment_intents_merchant_idempotency_unique").on(table.merchantId, table.idempotencyKey),
    uniqueIndex("payment_intents_order_unique").on(table.orderId),
    uniqueIndex("payment_intents_invoice_submission_unique").on(table.invoicePaymentSubmissionId),
  ],
);

export const paymentRecordsTable = pgTable("payment_records", {
  id: serial("id").primaryKey(),
  intentId: integer("intent_id").notNull().references(() => paymentIntentsTable.id),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  orderId: integer("order_id").references(() => ordersTable.id),
  invoicePaymentSubmissionId: integer("invoice_payment_submission_id").references(() => invoicePaymentSubmissionsTable.id),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  method: text("method").notNull(),
  status: text("status").notNull().default("created"),
  evidenceReference: text("evidence_reference"),
  verifiedBy: text("verified_by"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ledgerEntriesTable = pgTable("ledger_entries", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  orderId: integer("order_id").references(() => ordersTable.id),
  invoiceId: integer("invoice_id").references(() => invoicesTable.id),
  paymentRecordId: integer("payment_record_id").references(() => paymentRecordsTable.id),
  withdrawalId: integer("withdrawal_id").references(() => withdrawalsTable.id),
  refundId: integer("refund_id"),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  entryType: text("entry_type").notNull(),
  referenceKey: text("reference_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("ledger_entries_reference_unique").on(table.referenceKey),
]);

export const refundRecordsTable = pgTable("refund_records", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  paymentRecordId: integer("payment_record_id").notNull().references(() => paymentRecordsTable.id),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull().default("requested"),
  reason: text("reason").notNull(),
  inventoryRestock: boolean("inventory_restock").notNull().default(false),
  requestedBy: text("requested_by").notNull(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  providerRefundId: text("provider_refund_id"),
  providerStatus: text("provider_status"),
  providerFailureReason: text("provider_failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const commerceTransitionHistoryTable = pgTable("commerce_transition_history", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  orderId: integer("order_id").references(() => ordersTable.id),
  paymentIntentId: integer("payment_intent_id").references(() => paymentIntentsTable.id),
  refundId: integer("refund_id").references(() => refundRecordsTable.id),
  withdrawalId: integer("withdrawal_id").references(() => withdrawalsTable.id),
  entityType: text("entity_type").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  actorId: text("actor_id").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const merchantBalanceSnapshotsTable = pgTable("merchant_balance_snapshots", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  currency: text("currency").notNull(),
  ledgerBalanceMinor: integer("ledger_balance_minor").notNull().default(0),
  availableBalanceMinor: integer("available_balance_minor").notNull().default(0),
  heldBalanceMinor: integer("held_balance_minor").notNull().default(0),
  asOf: timestamp("as_of", { withTimezone: true }).notNull().defaultNow(),
});

export const tsPayAccountsTable = pgTable(
  "ts_pay_accounts",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchantsTable.id),
    accountNumber: text("account_number").notNull().unique(),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("ts_pay_accounts_merchant_unique").on(table.merchantId),
  ],
);

export const tsPayTransfersTable = pgTable(
  "ts_pay_transfers",
  {
    id: serial("id").primaryKey(),
    fromMerchantId: integer("from_merchant_id")
      .notNull()
      .references(() => merchantsTable.id),
    toMerchantId: integer("to_merchant_id")
      .notNull()
      .references(() => merchantsTable.id),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("completed"),
    referenceKey: text("reference_key").notNull().unique(),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("ts_pay_transfers_from_idx").on(table.fromMerchantId, table.createdAt),
    index("ts_pay_transfers_to_idx").on(table.toMerchantId, table.createdAt),
  ],
);

export const reconciliationRecordsTable = pgTable("reconciliation_records", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  currency: text("currency").notNull(),
  expectedMinor: integer("expected_minor").notNull(),
  observedMinor: integer("observed_minor").notNull(),
  discrepancyMinor: integer("discrepancy_minor").notNull(),
  status: text("status").notNull().default("open"),
  note: text("note"),
  createdBy: text("created_by").notNull(),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMerchantSchema = createInsertSchema(merchantsTable).omit({
  id: true,
  registeredAt: true,
});
export const insertSubscriptionSchema = createInsertSchema(
  subscriptionsTable,
).omit({ id: true, updatedAt: true });
export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({
  id: true,
  createdAt: true,
});
export const insertActivitySchema = createInsertSchema(activityTable).omit({
  id: true,
  occurredAt: true,
});
export const insertCustomerSchema = createInsertSchema(customersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertInvoiceLineSchema = createInsertSchema(invoiceLinesTable).omit({
  id: true,
  createdAt: true,
});
export const insertInvoicePaymentSubmissionSchema = createInsertSchema(
  invoicePaymentSubmissionsTable,
).omit({ id: true, createdAt: true });
export const insertMerchantBankAccountSchema = createInsertSchema(
  merchantBankAccountsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertWithdrawalSecuritySchema = createInsertSchema(
  withdrawalSecurityTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertWithdrawalSchema = createInsertSchema(withdrawalsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertPaymentIntentSchema = createInsertSchema(paymentIntentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPaymentRecordSchema = createInsertSchema(paymentRecordsTable).omit({ id: true, createdAt: true });
export const insertLedgerEntrySchema = createInsertSchema(ledgerEntriesTable).omit({ id: true, createdAt: true });
export const insertRefundRecordSchema = createInsertSchema(refundRecordsTable).omit({ id: true, createdAt: true });
export const insertCommerceTransitionSchema = createInsertSchema(commerceTransitionHistoryTable).omit({ id: true, createdAt: true });
export const insertBalanceSnapshotSchema = createInsertSchema(merchantBalanceSnapshotsTable).omit({ id: true, asOf: true });
export const insertTsPayAccountSchema = createInsertSchema(tsPayAccountsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertTsPayTransferSchema = createInsertSchema(tsPayTransfersTable).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});
export const insertReconciliationSchema = createInsertSchema(reconciliationRecordsTable).omit({ id: true, createdAt: true });
export const insertSupplierProductSchema = createInsertSchema(
  supplierProductsTable,
).omit({
  id: true,
  importedAt: true,
  updatedAt: true,
});
export const insertInventoryReservationSchema = createInsertSchema(inventoryReservationsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertInventoryMovementSchema = createInsertSchema(inventoryMovementsTable).omit({
  id: true, createdAt: true,
});
export const insertAiModelSchema = createInsertSchema(aiModelsTable).omit({
  id: true,
  createdAt: true,
});
export const insertAiSettingsSchema = createInsertSchema(aiSettingsTable).omit({
  id: true,
  updatedAt: true,
});
export const insertAiActionSchema = createInsertSchema(aiActionsTable).omit({
  id: true,
  createdAt: true,
});

export type Merchant = typeof merchantsTable.$inferSelect;
export type Subscription = typeof subscriptionsTable.$inferSelect;
export type Payment = typeof paymentsTable.$inferSelect;
export type Activity = typeof activityTable.$inferSelect;
export type Customer = typeof customersTable.$inferSelect;
export type Order = typeof ordersTable.$inferSelect;
export type Invoice = typeof invoicesTable.$inferSelect;
export type InvoiceLine = typeof invoiceLinesTable.$inferSelect;
export type InvoicePaymentSubmission = typeof invoicePaymentSubmissionsTable.$inferSelect;
export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InsertInvoiceLine = z.infer<typeof insertInvoiceLineSchema>;
export type InsertInvoicePaymentSubmission = z.infer<
  typeof insertInvoicePaymentSubmissionSchema
>;
export type MerchantBankAccount = typeof merchantBankAccountsTable.$inferSelect;
export type InsertMerchantBankAccount = z.infer<
  typeof insertMerchantBankAccountSchema
>;
export type WithdrawalSecurity = typeof withdrawalSecurityTable.$inferSelect;
export type Withdrawal = typeof withdrawalsTable.$inferSelect;
export type SupplierProduct = typeof supplierProductsTable.$inferSelect;
export type InsertWithdrawalSecurity = z.infer<
  typeof insertWithdrawalSecuritySchema
>;
export type InsertWithdrawal = z.infer<typeof insertWithdrawalSchema>;
export type PaymentIntent = typeof paymentIntentsTable.$inferSelect;
export type PaymentRecord = typeof paymentRecordsTable.$inferSelect;
export type LedgerEntry = typeof ledgerEntriesTable.$inferSelect;
export type RefundRecord = typeof refundRecordsTable.$inferSelect;
export type CommerceTransition = typeof commerceTransitionHistoryTable.$inferSelect;
export type MerchantBalanceSnapshot = typeof merchantBalanceSnapshotsTable.$inferSelect;
export type TsPayAccount = typeof tsPayAccountsTable.$inferSelect;
export type TsPayTransfer = typeof tsPayTransfersTable.$inferSelect;
export type ReconciliationRecord = typeof reconciliationRecordsTable.$inferSelect;
export type InsertPaymentIntent = z.infer<typeof insertPaymentIntentSchema>;
export type InsertPaymentRecord = z.infer<typeof insertPaymentRecordSchema>;
export type InsertLedgerEntry = z.infer<typeof insertLedgerEntrySchema>;
export type InsertRefundRecord = z.infer<typeof insertRefundRecordSchema>;
export type InsertCommerceTransition = z.infer<typeof insertCommerceTransitionSchema>;
export type InsertBalanceSnapshot = z.infer<typeof insertBalanceSnapshotSchema>;
export type InsertTsPayAccount = z.infer<typeof insertTsPayAccountSchema>;
export type InsertTsPayTransfer = z.infer<typeof insertTsPayTransferSchema>;
export type InsertReconciliation = z.infer<typeof insertReconciliationSchema>;
export type InsertSupplierProduct = z.infer<typeof insertSupplierProductSchema>;
export type InventoryReservation = typeof inventoryReservationsTable.$inferSelect;
export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;
export type InsertInventoryReservation = z.infer<typeof insertInventoryReservationSchema>;
export type InsertInventoryMovement = z.infer<typeof insertInventoryMovementSchema>;
export type AiModel = typeof aiModelsTable.$inferSelect;
export type AiSettings = typeof aiSettingsTable.$inferSelect;
export type AiAction = typeof aiActionsTable.$inferSelect;
export type AdvertisingPayment =
  typeof advertisingPaymentsTable.$inferSelect;
export type AuctionListing = typeof auctionListingsTable.$inferSelect;
export type AuctionBid = typeof auctionBidsTable.$inferSelect;
export type InsertAiModel = z.infer<typeof insertAiModelSchema>;
export type InsertAiSettings = z.infer<typeof insertAiSettingsSchema>;
export type InsertAiAction = z.infer<typeof insertAiActionSchema>;
export type DomainEvent = typeof domainEventsTable.$inferSelect;
export type DomainEventConsumption = typeof domainEventConsumptionsTable.$inferSelect;
export type Notification = typeof notificationsTable.$inferSelect;