import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { merchantsTable, merchantStorefrontsTable } from "./commerce";

export const merchantStorefrontDomainsTable = pgTable(
  "merchant_storefront_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id, { onDelete: "cascade" }),
    storefrontId: uuid("storefront_id").references(() => merchantStorefrontsTable.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull(),
    domainType: text("domain_type").notNull().default("custom"),
    verificationToken: text("verification_token").notNull(),
    verificationMethod: text("verification_method").notNull().default("dns_txt"),
    status: text("status").notNull().default("pending"),
    isPrimary: boolean("is_primary").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("merchant_storefront_domains_hostname_unique").on(table.hostname),
    index("merchant_storefront_domains_merchant_idx").on(table.merchantId, table.status),
    index("merchant_storefront_domains_storefront_idx").on(table.storefrontId, table.status),
  ],
);
