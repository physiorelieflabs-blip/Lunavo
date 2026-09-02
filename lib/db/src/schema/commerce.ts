import {
  boolean,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
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
  status: text("status").notNull().default("active"),
  registeredAt: timestamp("registered_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
    amountPaid: numeric("amount_paid", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    earningsHeld: numeric("earnings_held", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
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

export const ordersTable = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchantsTable.id),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customersTable.id),
    orderNumber: text("order_number").notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("paid"),
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
  ],
);

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

export type Merchant = typeof merchantsTable.$inferSelect;
export type Subscription = typeof subscriptionsTable.$inferSelect;
export type Payment = typeof paymentsTable.$inferSelect;
export type Activity = typeof activityTable.$inferSelect;
export type Customer = typeof customersTable.$inferSelect;
export type Order = typeof ordersTable.$inferSelect;
export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type InsertOrder = z.infer<typeof insertOrderSchema>;