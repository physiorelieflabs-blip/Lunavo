import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { merchantStorefrontsTable, merchantsTable } from "./commerce";

export const storefrontPublicationSnapshotsTable = pgTable(
  "storefront_publication_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storefrontId: uuid("storefront_id").notNull().references(() => merchantStorefrontsTable.id, { onDelete: "cascade" }),
    merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    theme: jsonb("theme").notNull(),
    sections: jsonb("sections").notNull(),
    contentHash: text("content_hash").notNull(),
    publishedByClerkUserId: text("published_by_clerk_user_id").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("storefront_publication_snapshots_storefront_version_idx").on(table.storefrontId, table.version),
    index("storefront_publication_snapshots_merchant_idx").on(table.merchantId, table.publishedAt),
  ],
);
