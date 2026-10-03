import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";

export const supportTicketsTable = pgTable("support_tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  customerId: integer("customer_id"),
  orderId: integer("order_id"),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("normal"),
  assignedTo: text("assigned_to"),
  createdBy: text("created_by").notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("support_tickets_merchant_status_idx").on(table.merchantId, table.status, table.updatedAt),
  index("support_tickets_merchant_customer_idx").on(table.merchantId, table.customerId, table.createdAt),
]);

export const supportMessagesTable = pgTable("support_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id").notNull(),
  merchantId: integer("merchant_id").notNull(),
  authorType: text("author_type").notNull(),
  authorId: text("author_id"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("support_messages_ticket_created_idx").on(table.ticketId, table.createdAt),
]);

export const serviceBookingsTable = pgTable("service_bookings", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  customerId: integer("customer_id"),
  serviceName: text("service_name").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  status: text("status").notNull().default("requested"),
  notes: text("notes"),
  idempotencyKey: text("idempotency_key").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("service_bookings_merchant_idempotency_unique").on(table.merchantId, table.idempotencyKey),
  index("service_bookings_merchant_starts_idx").on(table.merchantId, table.startsAt),
]);

export const returnRequestsTable = pgTable("return_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  orderId: integer("order_id").notNull(),
  customerId: integer("customer_id"),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("requested"),
  requestedAmountMinor: integer("requested_amount_minor").notNull(),
  currency: text("currency").notNull(),
  resolution: text("resolution"),
  requestedBy: text("requested_by").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("return_requests_merchant_status_idx").on(table.merchantId, table.status, table.createdAt),
  index("return_requests_order_idx").on(table.merchantId, table.orderId, table.createdAt),
]);

export const purchaseOrdersTable = pgTable("purchase_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  supplierName: text("supplier_name").notNull(),
  status: text("status").notNull().default("draft"),
  currency: text("currency").notNull(),
  notes: text("notes"),
  orderedAt: timestamp("ordered_at", { withTimezone: true }),
  expectedAt: timestamp("expected_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("purchase_orders_merchant_idempotency_unique").on(table.merchantId, table.idempotencyKey),
  index("purchase_orders_merchant_status_idx").on(table.merchantId, table.status, table.createdAt),
]);

export const purchaseOrderItemsTable = pgTable("purchase_order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  purchaseOrderId: uuid("purchase_order_id").notNull(),
  merchantId: integer("merchant_id").notNull(),
  supplierProductId: integer("supplier_product_id"),
  description: text("description").notNull(),
  quantityOrdered: integer("quantity_ordered").notNull(),
  quantityReceived: integer("quantity_received").notNull().default(0),
  unitCostMinor: integer("unit_cost_minor").notNull(),
  currency: text("currency").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("purchase_order_items_order_idx").on(table.purchaseOrderId),
  index("purchase_order_items_merchant_idx").on(table.merchantId),
]);

export const b2bAccountsTable = pgTable("b2b_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  customerId: integer("customer_id"),
  companyName: text("company_name").notNull(),
  taxId: text("tax_id"),
  status: text("status").notNull().default("pending"),
  paymentTermsDays: integer("payment_terms_days").notNull().default(0),
  priceList: jsonb("price_list").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("b2b_accounts_merchant_customer_unique").on(table.merchantId, table.customerId).where(sql`${table.customerId} IS NOT NULL`),
  index("b2b_accounts_merchant_status_idx").on(table.merchantId, table.status, table.createdAt),
]);

export const b2bPriceRulesTable = pgTable("b2b_price_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  b2bAccountId: uuid("b2b_account_id").notNull(),
  supplierProductId: integer("supplier_product_id").notNull(),
  minimumQuantity: integer("minimum_quantity").notNull(),
  unitPriceMinor: integer("unit_price_minor").notNull(),
  currency: text("currency").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("b2b_price_rules_unique").on(table.b2bAccountId, table.supplierProductId, table.minimumQuantity),
  index("b2b_price_rules_merchant_idx").on(table.merchantId, table.b2bAccountId),
]);
