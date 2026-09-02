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
  currency: text("currency").notNull().default("USD"),
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
    customerId: integer("customer_id")
      .notNull()
      .references(() => customersTable.id),
    orderNumber: text("order_number").notNull(),
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
export const insertSupplierProductSchema = createInsertSchema(
  supplierProductsTable,
).omit({
  id: true,
  importedAt: true,
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
export type InsertSupplierProduct = z.infer<typeof insertSupplierProductSchema>;