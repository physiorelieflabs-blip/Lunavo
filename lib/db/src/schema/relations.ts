// ============================================================================
// Drizzle Relationships (optional, for better query ergonomics)
// ============================================================================

import { relations } from 'drizzle-orm';
import {
  usersTable,
  sessionsTable,
  merchantsTable,
  storesTable,
  productsTable,
  ordersTable,
  customersTable,
  transactionsTable,
  subscriptionsTable,
  withdrawalRequestsTable,
  auctionsTable,
  auctionBidsTable,
  mediaAssetsTable,
  inventoryMovementsTable,
  referralRewardsTable,
  marketplaceListingsTable,
} from './index';

export const usersRelations = relations(usersTable, ({ one, many }) => ({
  merchant: one(merchantsTable, {
    fields: [usersTable.id],
    references: [merchantsTable.userId],
  }),
  sessions: many(sessionsTable),
}));

export const merchantsRelations = relations(merchantsTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [merchantsTable.userId],
    references: [usersTable.id],
  }),
  stores: many(storesTable),
  subscriptions: one(subscriptionsTable),
  transactions: many(transactionsTable),
  products: many(productsTable),
  orders: many(ordersTable),
  withdrawals: many(withdrawalRequestsTable),
  auctions: many(auctionsTable),
  mediaAssets: many(mediaAssetsTable),
}));

export const storesRelations = relations(storesTable, ({ one, many }) => ({
  merchant: one(merchantsTable, {
    fields: [storesTable.merchantId],
    references: [merchantsTable.id],
  }),
  products: many(productsTable),
  orders: many(ordersTable),
}));

export const productsRelations = relations(productsTable, ({ one, many }) => ({
  store: one(storesTable, {
    fields: [productsTable.storeId],
    references: [storesTable.id],
  }),
  merchant: one(merchantsTable, {
    fields: [productsTable.merchantId],
    references: [merchantsTable.id],
  }),
  inventoryMovements: many(inventoryMovementsTable),
}));

export const customersRelations = relations(customersTable, ({ one, many }) => ({
  merchant: one(merchantsTable, {
    fields: [customersTable.merchantId],
    references: [merchantsTable.id],
  }),
  orders: many(ordersTable),
}));

export const ordersRelations = relations(ordersTable, ({ one, many }) => ({
  store: one(storesTable, {
    fields: [ordersTable.storeId],
    references: [storesTable.id],
  }),
  merchant: one(merchantsTable, {
    fields: [ordersTable.merchantId],
    references: [merchantsTable.id],
  }),
  customer: one(customersTable, {
    fields: [ordersTable.customerId],
    references: [customersTable.id],
  }),
  transaction: one(transactionsTable, {
    fields: [ordersTable.paymentId],
    references: [transactionsTable.id],
  }),
}));

export const transactionsRelations = relations(transactionsTable, ({ one, many }) => ({
  merchant: one(merchantsTable, {
    fields: [transactionsTable.merchantId],
    references: [merchantsTable.id],
  }),
  order: one(ordersTable, {
    fields: [transactionsTable.orderId],
    references: [ordersTable.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptionsTable, ({ one }) => ({
  merchant: one(merchantsTable, {
    fields: [subscriptionsTable.merchantId],
    references: [merchantsTable.id],
  }),
}));

export const withdrawalRequestsRelations = relations(withdrawalRequestsTable, ({ one }) => ({
  merchant: one(merchantsTable, {
    fields: [withdrawalRequestsTable.merchantId],
    references: [merchantsTable.id],
  }),
}));

export const auctionsRelations = relations(auctionsTable, ({ one, many }) => ({
  sellerMerchant: one(merchantsTable, {
    fields: [auctionsTable.sellerMerchantId],
    references: [merchantsTable.id],
  }),
  bids: many(auctionBidsTable),
}));

export const auctionBidsRelations = relations(auctionBidsTable, ({ one }) => ({
  auction: one(auctionsTable, {
    fields: [auctionBidsTable.auctionId],
    references: [auctionsTable.id],
  }),
}));

export const mediaAssetsRelations = relations(mediaAssetsTable, ({ one }) => ({
  merchant: one(merchantsTable, {
    fields: [mediaAssetsTable.merchantId],
    references: [merchantsTable.id],
  }),
}));
