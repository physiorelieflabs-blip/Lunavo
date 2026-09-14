// ============================================================================
// Lunavo Core Database Schema
// ============================================================================
// Authoritative source of truth for all business entities.
// PostgreSQL with Drizzle ORM.
// Self-hosted, no external data dependencies.

import { pgTable, text, varchar, integer, decimal, boolean, timestamp, smallint, pgEnum, index, unique, foreignKey, primaryKey, jsonb, serial } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// ENUMS
// ============================================================================

export const userRoleEnum = pgEnum('user_role', ['master_admin', 'user', 'support']);
export const merchantStatusEnum = pgEnum('merchant_status', ['active', 'suspended', 'inactive']);
export const storeStatusEnum = pgEnum('store_status', ['draft', 'active', 'paused', 'archived', 'suspended']);
export const orderStatusEnum = pgEnum('order_status', [
  'draft',
  'pending_payment',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'completed',
  'canceled',
  'refunded',
  'partially_refunded',
  'disputed'
]);
export const transactionStatusEnum = pgEnum('transaction_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'canceled',
  'refunded'
]);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'pending',
  'active',
  'past_due',
  'canceled',
  'expired'
]);
export const auctionStatusEnum = pgEnum('auction_status', [
  'draft',
  'scheduled',
  'live',
  'closed',
  'settled',
  'canceled'
]);
export const withdrawalStatusEnum = pgEnum('withdrawal_status', [
  'requested',
  'pending_review',
  'approved',
  'processing',
  'completed',
  'failed',
  'rejected',
  'reversed'
]);

// ============================================================================
// USERS & AUTHENTICATION
// ============================================================================

export const usersTable = pgTable(
  'users',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    displayName: varchar('display_name', { length: 255 }),
    passwordHash: varchar('password_hash', { length: 255 }), // Argon2id
    role: userRoleEnum('role').default('user').notNull(),
    mfaEnabled: boolean('mfa_enabled').default(false),
    mfaSecret: varchar('mfa_secret', { length: 255 }), // Encrypted
    emailVerified: boolean('email_verified').default(false),
    emailVerificationToken: varchar('email_verification_token', { length: 255 }),
    emailVerificationTokenExpiresAt: timestamp('email_verification_token_expires_at', { withTimezone: true }),
    passwordResetToken: varchar('password_reset_token', { length: 255 }),
    passwordResetTokenExpiresAt: timestamp('password_reset_token_expires_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    suspiciousLoginDetectedAt: timestamp('suspicious_login_detected_at', { withTimezone: true }),
    accountLockedUntil: timestamp('account_locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_users_email').on(table.email),
    index('idx_users_role').on(table.role),
  ])
);

export const sessionsTable = pgTable(
  'sessions',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    userId: varchar('user_id', { length: 40 }).notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    sessionTokenHash: varchar('session_token_hash', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_sessions_user_id').on(table.userId),
    index('idx_sessions_expires_at').on(table.expiresAt),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersTable.id],
      onDelete: 'cascade',
    }),
  ])
);

// ============================================================================
// MERCHANTS & STORES
// ============================================================================

export const merchantsTable = pgTable(
  'merchants',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    userId: varchar('user_id', { length: 40 }).notNull().unique(),
    merchantKey: varchar('merchant_key', { length: 50 }).notNull().unique(), // Public identifier
    companyName: varchar('company_name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 20 }),
    status: merchantStatusEnum('status').default('active').notNull(),
    subscriptionId: varchar('subscription_id', { length: 40 }),
    subscriptionExpiresAt: timestamp('subscription_expires_at', { withTimezone: true }),
    currentBalance: decimal('current_balance', { precision: 20, scale: 2 }).default('0').notNull(),
    availableBalance: decimal('available_balance', { precision: 20, scale: 2 }).default('0').notNull(),
    heldBalance: decimal('held_balance', { precision: 20, scale: 2 }).default('0').notNull(),
    currencyCode: varchar('currency_code', { length: 3 }).default('USD').notNull(),
    kycVerified: boolean('kyc_verified').default(false),
    businessRegistrationNumber: varchar('business_registration_number', { length: 100 }),
    taxId: varchar('tax_id', { length: 100 }),
    storeWebsite: varchar('store_website', { length: 255 }),
    referralCode: varchar('referral_code', { length: 20 }).unique(),
    referralDiscountPercent: integer('referral_discount_percent').default(0),
    referralDiscountExpiresAt: timestamp('referral_discount_expires_at', { withTimezone: true }),
    suspendedReason: text('suspended_reason'),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_merchants_user_id').on(table.userId),
    index('idx_merchants_merchant_key').on(table.merchantKey),
    index('idx_merchants_status').on(table.status),
    index('idx_merchants_referral_code').on(table.referralCode),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersTable.id],
      onDelete: 'cascade',
    }),
  ])
);

export const storesTable = pgTable(
  'stores',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    merchantId: varchar('merchant_id', { length: 40 }).notNull(),
    storeKey: varchar('store_key', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    description: text('description'),
    logoUrl: varchar('logo_url', { length: 500 }),
    faviconUrl: varchar('favicon_url', { length: 500 }),
    primaryDomain: varchar('primary_domain', { length: 255 }),
    status: storeStatusEnum('status').default('draft').notNull(),
    currencyCode: varchar('currency_code', { length: 3 }).default('USD').notNull(),
    taxRatePercent: decimal('tax_rate_percent', { precision: 5, scale: 2 }).default('0'),
    settings: jsonb('settings'), // Store-specific configuration
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedVersion: integer('published_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_stores_merchant_id').on(table.merchantId),
    index('idx_stores_status').on(table.status),
    index('idx_stores_primary_domain').on(table.primaryDomain),
    unique('unique_store_per_merchant_slug').on(table.merchantId, table.slug),
    foreignKey({
      columns: [table.merchantId],
      foreignColumns: [merchantsTable.id],
      onDelete: 'cascade',
    }),
  ])
);

// ============================================================================
// PRODUCTS & INVENTORY
// ============================================================================

export const productsTable = pgTable(
  'products',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    storeId: varchar('store_id', { length: 40 }).notNull(),
    merchantId: varchar('merchant_id', { length: 40 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    description: text('description'),
    currencyCode: varchar('currency_code', { length: 3 }).notNull(),
    basePrice: decimal('base_price', { precision: 14, scale: 2 }).notNull(),
    salePrice: decimal('sale_price', { precision: 14, scale: 2 }),
    cost: decimal('cost', { precision: 14, scale: 2 }),
    sku: varchar('sku', { length: 100 }),
    type: varchar('type', { length: 50 }).default('physical'), // physical, digital, course, membership, service, etc.
    weight: decimal('weight', { precision: 10, scale: 3 }), // in kg
    dimensions: jsonb('dimensions'), // {length, width, height}
    images: jsonb('images'), // Array of image URLs and metadata
    stock: integer('stock').default(0),
    reserved: integer('reserved').default(0),
    status: varchar('status', { length: 50 }).default('active'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_products_store_id').on(table.storeId),
    index('idx_products_merchant_id').on(table.merchantId),
    index('idx_products_status').on(table.status),
    unique('unique_product_per_store_slug').on(table.storeId, table.slug),
    foreignKey({
      columns: [table.storeId],
      foreignColumns: [storesTable.id],
      onDelete: 'cascade',
    }),
    foreignKey({
      columns: [table.merchantId],
      foreignColumns: [merchantsTable.id],
      onDelete: 'cascade',
    }),
  ])
);

export const inventoryMovementsTable = pgTable(
  'inventory_movements',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    productId: varchar('product_id', { length: 40 }).notNull(),
    orderId: varchar('order_id', { length: 40 }),
    type: varchar('type', { length: 50 }).notNull(), // in, out, reserved, released, damaged
    quantity: integer('quantity').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_inventory_movements_product_id').on(table.productId),
    index('idx_inventory_movements_order_id').on(table.orderId),
    foreignKey({
      columns: [table.productId],
      foreignColumns: [productsTable.id],
      onDelete: 'cascade',
    }),
  ])
);

// ============================================================================
// ORDERS & CUSTOMERS
// ============================================================================

export const customersTable = pgTable(
  'customers',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    merchantId: varchar('merchant_id', { length: 40 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    firstName: varchar('first_name', { length: 100 }),
    lastName: varchar('last_name', { length: 100 }),
    phone: varchar('phone', { length: 20 }),
    address: text('address'),
    city: varchar('city', { length: 100 }),
    postalCode: varchar('postal_code', { length: 20 }),
    country: varchar('country', { length: 2 }),
    lifetimeValue: decimal('lifetime_value', { precision: 14, scale: 2 }).default('0'),
    orderCount: integer('order_count').default(0),
    lastOrderAt: timestamp('last_order_at', { withTimezone: true }),
    marketingConsent: boolean('marketing_consent').default(false),
    tags: text('tags'), // Comma-separated
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_customers_merchant_id').on(table.merchantId),
    index('idx_customers_email').on(table.email),
    unique('unique_customer_per_merchant').on(table.merchantId, table.email),
    foreignKey({
      columns: [table.merchantId],
      foreignColumns: [merchantsTable.id],
      onDelete: 'cascade',
    }),
  ])
);

export const ordersTable = pgTable(
  'orders',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    orderNumber: varchar('order_number', { length: 50 }).notNull(),
    storeId: varchar('store_id', { length: 40 }).notNull(),
    merchantId: varchar('merchant_id', { length: 40 }).notNull(),
    customerId: varchar('customer_id', { length: 40 }),
    status: orderStatusEnum('status').default('pending_payment').notNull(),
    currencyCode: varchar('currency_code', { length: 3 }).notNull(),
    grossAmount: decimal('gross_amount', { precision: 14, scale: 2 }).notNull(),
    taxAmount: decimal('tax_amount', { precision: 14, scale: 2 }).default('0'),
    shippingAmount: decimal('shipping_amount', { precision: 14, scale: 2 }).default('0'),
    discountAmount: decimal('discount_amount', { precision: 14, scale: 2 }).default('0'),
    netAmount: decimal('net_amount', { precision: 14, scale: 2 }).notNull(),
    paymentId: varchar('payment_id', { length: 40 }),
    refundedAmount: decimal('refunded_amount', { precision: 14, scale: 2 }).default('0'),
    customerEmail: varchar('customer_email', { length: 255 }),
    shippingAddress: jsonb('shipping_address'),
    billingAddress: jsonb('billing_address'),
    items: jsonb('items'), // Array of {productId, quantity, price}
    notes: text('notes'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_orders_store_id').on(table.storeId),
    index('idx_orders_merchant_id').on(table.merchantId),
    index('idx_orders_customer_id').on(table.customerId),
    index('idx_orders_status').on(table.status),
    index('idx_orders_payment_id').on(table.paymentId),
    unique('unique_order_number_per_store').on(table.storeId, table.orderNumber),
    foreignKey({
      columns: [table.storeId],
      foreignColumns: [storesTable.id],
      onDelete: 'cascade',
    }),
    foreignKey({
      columns: [table.merchantId],
      foreignColumns: [merchantsTable.id],
      onDelete: 'cascade',
    }),
    foreignKey({
      columns: [table.customerId],
      foreignColumns: [customersTable.id],
      onDelete: 'set null',
    }),
  ])
);

// ============================================================================
// PAYMENTS & TRANSACTIONS (TS PAY)
// ============================================================================

export const transactionsTable = pgTable(
  'transactions',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    idempotencyKey: varchar('idempotency_key', { length: 100 }).unique(),
    merchantId: varchar('merchant_id', { length: 40 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(), // sale, refund, withdrawal, subscription, transfer, adjustment, fee
    status: transactionStatusEnum('status').default('pending').notNull(),
    currencyCode: varchar('currency_code', { length: 3 }).notNull(),
    grossAmount: decimal('gross_amount', { precision: 14, scale: 2 }).notNull(),
    providerFee: decimal('provider_fee', { precision: 14, scale: 2 }).default('0'),
    lunavoFee: decimal('lunavo_fee', { precision: 14, scale: 2 }).default('0'),
    netAmount: decimal('net_amount', { precision: 14, scale: 2 }).notNull(),
    orderId: varchar('order_id', { length: 40 }),
    providerReference: varchar('provider_reference', { length: 255 }),
    providerStatus: varchar('provider_status', { length: 50 }),
    sourceId: varchar('source_id', { length: 40 }), // withdrawal request, invoice, etc.
    description: text('description'),
    metadata: jsonb('metadata'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_transactions_merchant_id').on(table.merchantId),
    index('idx_transactions_type').on(table.type),
    index('idx_transactions_status').on(table.status),
    index('idx_transactions_order_id').on(table.orderId),
    index('idx_transactions_provider_reference').on(table.providerReference),
    unique('unique_idempotency_key').on(table.idempotencyKey),
    foreignKey({
      columns: [table.merchantId],
      foreignColumns: [merchantsTable.id],
      onDelete: 'cascade',
    }),
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [ordersTable.id],
      onDelete: 'set null',
    }),
  ])
);

export const paymentWebhookEventsTable = pgTable(
  'payment_webhook_events',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    provider: varchar('provider', { length: 50 }).notNull(), // flutterwave, stripe, etc.
    webhookId: varchar('webhook_id', { length: 255 }).notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    providerPaymentId: varchar('provider_payment_id', { length: 255 }),
    payload: jsonb('payload').notNull(),
    status: varchar('status', { length: 50 }).default('received').notNull(), // received, processing, processed, failed, reconciliation_required
    error: text('error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_payment_webhooks_provider').on(table.provider),
    index('idx_payment_webhooks_status').on(table.status),
    unique('unique_webhook_event').on(table.provider, table.webhookId),
  ])
);

// ============================================================================
// SUBSCRIPTIONS & REFERRALS
// ============================================================================

export const subscriptionsTable = pgTable(
  'subscriptions',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    merchantId: varchar('merchant_id', { length: 40 }).notNull().unique(),
    status: subscriptionStatusEnum('status').default('pending').notNull(),
    plan: varchar('plan', { length: 50 }).default('core').notNull(), // core ($30/month)
    currencyCode: varchar('currency_code', { length: 3 }).notNull(),
    monthlyAmount: decimal('monthly_amount', { precision: 14, scale: 2 }).notNull(),
    appliedReferralDiscount: decimal('applied_referral_discount', { precision: 14, scale: 2 }).default('0'),
    billingStartAt: timestamp('billing_start_at', { withTimezone: true }),
    nextBillingAt: timestamp('next_billing_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastPaymentAt: timestamp('last_payment_at', { withTimezone: true }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_subscriptions_merchant_id').on(table.merchantId),
    index('idx_subscriptions_status').on(table.status),
    index('idx_subscriptions_next_billing_at').on(table.nextBillingAt),
    foreignKey({
      columns: [table.merchantId],
      foreignColumns: [merchantsTable.id],
      onDelete: 'cascade',
    }),
  ])
);

export const referralRewardsTable = pgTable(
  'referral_rewards',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    referrerMerchantId: varchar('referrer_merchant_id', { length: 40 }).notNull(),
    referredMerchantId: varchar('referred_merchant_id', { length: 40 }).notNull(),
    referralCode: varchar('referral_code', { length: 20 }).notNull(),
    status: varchar('status', { length: 50 }).default('pending').notNull(), // pending, qualified, claimed, applied
    qualifyingTransactionId: varchar('qualifying_transaction_id', { length: 40 }),
    rewardAmount: decimal('reward_amount', { precision: 14, scale: 2 }),
    rewardType: varchar('reward_type', { length: 50 }).default('discount_percent'), // discount_percent, discount_amount, credit
    rewardValue: decimal('reward_value', { precision: 5, scale: 2 }).default('30'), // 30% for standard referral
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_referral_rewards_referrer').on(table.referrerMerchantId),
    index('idx_referral_rewards_referred').on(table.referredMerchantId),
    unique('unique_referral_per_merchant_pair').on(table.referrerMerchantId, table.referredMerchantId),
    foreignKey({
      columns: [table.referrerMerchantId],
      foreignColumns: [merchantsTable.id],
      onDelete: 'cascade',
    }),
    foreignKey({
      columns: [table.referredMerchantId],
      foreignColumns: [merchantsTable.id],
      onDelete: 'cascade',
    }),
  ])
);

// ============================================================================
// WITHDRAWALS
// ============================================================================

export const withdrawalRequestsTable = pgTable(
  'withdrawal_requests',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    merchantId: varchar('merchant_id', { length: 40 }).notNull(),
    status: withdrawalStatusEnum('status').default('requested').notNull(),
    currencyCode: varchar('currency_code', { length: 3 }).notNull(),
    amount: decimal('amount', { precision: 14, scale: 2 }).notNull(),
    bankName: varchar('bank_name', { length: 255 }),
    accountNumber: varchar('account_number', { length: 255 }), // Encrypted
    accountHolderName: varchar('account_holder_name', { length: 255 }),
    recipientCode: varchar('recipient_code', { length: 255 }), // Flutterwave recipient code
    providerTransferId: varchar('provider_transfer_id', { length: 255 }),
    providerStatus: varchar('provider_status', { length: 50 }),
    approvalComment: text('approval_comment'),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: varchar('reviewed_by', { length: 40 }), // Master admin ID
    processedAt: timestamp('processed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_withdrawals_merchant_id').on(table.merchantId),
    index('idx_withdrawals_status').on(table.status),
    foreignKey({
      columns: [table.merchantId],
      foreignColumns: [merchantsTable.id],
      onDelete: 'cascade',
    }),
  ])
);

// ============================================================================
// AUCTIONS
// ============================================================================

export const auctionsTable = pgTable(
  'auctions',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    storeId: varchar('store_id', { length: 40 }),
    sellerMerchantId: varchar('seller_merchant_id', { length: 40 }).notNull(),
    auctionType: varchar('auction_type', { length: 50 }).notNull(), // store, product
    status: auctionStatusEnum('status').default('draft').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    currencyCode: varchar('currency_code', { length: 3 }).notNull(),
    startingPrice: decimal('starting_price', { precision: 14, scale: 2 }).notNull(),
    floorPrice: decimal('floor_price', { precision: 14, scale: 2 }),
    currentHighBid: decimal('current_high_bid', { precision: 14, scale: 2 }).default('0'),
    currentHighBidderId: varchar('current_high_bidder_id', { length: 40 }),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }).notNull(),
    totalBids: integer('total_bids').default(0),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    settledTransactionId: varchar('settled_transaction_id', { length: 40 }),
    winningBidId: varchar('winning_bid_id', { length: 40 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_auctions_store_id').on(table.storeId),
    index('idx_auctions_seller_merchant_id').on(table.sellerMerchantId),
    index('idx_auctions_status').on(table.status),
    index('idx_auctions_end_time').on(table.endTime),
    foreignKey({
      columns: [table.sellerMerchantId],
      foreignColumns: [merchantsTable.id],
      onDelete: 'cascade',
    }),
  ])
);

export const auctionBidsTable = pgTable(
  'auction_bids',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    auctionId: varchar('auction_id', { length: 40 }).notNull(),
    bidderMerchantId: varchar('bidder_merchant_id', { length: 40 }), // For merchant auctions; NULL for product auctions
    bidderId: varchar('bidder_id', { length: 40 }), // User ID for product/general auctions
    bidAmount: decimal('bid_amount', { precision: 14, scale: 2 }).notNull(),
    bidAt: timestamp('bid_at', { withTimezone: true }).notNull().defaultNow(),
    isWinning: boolean('is_winning').default(false),
    status: varchar('status', { length: 50 }).default('active'), // active, canceled, outbid
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_auction_bids_auction_id').on(table.auctionId),
    index('idx_auction_bids_bidder').on(table.bidderId),
    foreignKey({
      columns: [table.auctionId],
      foreignColumns: [auctionsTable.id],
      onDelete: 'cascade',
    }),
  ])
);

// ============================================================================
// MARKETPLACE
// ============================================================================

export const marketplaceListingsTable = pgTable(
  'marketplace_listings',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    merchantId: varchar('merchant_id', { length: 40 }).notNull(),
    productId: varchar('product_id', { length: 40 }).notNull(),
    status: varchar('status', { length: 50 }).default('pending_review').notNull(),
    listing Fee: decimal('listing_fee', { precision: 14, scale: 2 }).notNull(),
    monthlyFee: decimal('monthly_fee', { precision: 14, scale: 2 }).default('5'), // $5/month
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_marketplace_listings_merchant_id').on(table.merchantId),
    index('idx_marketplace_listings_status').on(table.status),
    unique('unique_listing_per_product').on(table.productId),
    foreignKey({
      columns: [table.merchantId],
      foreignColumns: [merchantsTable.id],
      onDelete: 'cascade',
    }),
    foreignKey({
      columns: [table.productId],
      foreignColumns: [productsTable.id],
      onDelete: 'cascade',
    }),
  ])
);

// ============================================================================
// AUDIT LOGS
// ============================================================================

export const auditLogsTable = pgTable(
  'audit_logs',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    userId: varchar('user_id', { length: 40 }),
    merchantId: varchar('merchant_id', { length: 40 }),
    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 50 }),
    resourceId: varchar('resource_id', { length: 40 }),
    changes: jsonb('changes'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    status: varchar('status', { length: 50 }).default('success'), // success, failure
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_audit_logs_user_id').on(table.userId),
    index('idx_audit_logs_merchant_id').on(table.merchantId),
    index('idx_audit_logs_action').on(table.action),
    index('idx_audit_logs_created_at').on(table.createdAt),
  ])
);

// ============================================================================
// PROVIDER CREDENTIALS & CONFIGURATION
// ============================================================================

export const providerCredentialsTable = pgTable(
  'provider_credentials',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    provider: varchar('provider', { length: 50 }).notNull(), // flutterwave, stripe, etc.
    credentialType: varchar('credential_type', { length: 50 }).notNull(), // secret_key, webhook_secret, public_key
    encryptedValue: text('encrypted_value').notNull(),
    encryptionKeyVersion: integer('encryption_key_version').notNull().default(1),
    isActive: boolean('is_active').default(true),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    lastValidationStatus: varchar('last_validation_status', { length: 50 }), // success, failure
    lastValidationError: text('last_validation_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_provider_credentials_provider').on(table.provider),
    unique('unique_active_credential_per_provider_type').on(table.provider, table.credentialType),
  ])
);

// ============================================================================
// MEDIA & ASSETS
// ============================================================================

export const mediaAssetsTable = pgTable(
  'media_assets',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    merchantId: varchar('merchant_id', { length: 40 }).notNull(),
    filename: varchar('filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    size: integer('size').notNull(),
    url: varchar('url', { length: 500 }).notNull(),
    altText: varchar('alt_text', { length: 500 }),
    source: varchar('source', { length: 50 }).default('upload'), // upload, generated, external
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ([
    index('idx_media_assets_merchant_id').on(table.merchantId),
    foreignKey({
      columns: [table.merchantId],
      foreignColumns: [merchantsTable.id],
      onDelete: 'cascade',
    }),
  ])
);

// ============================================================================
// EXPORT
// ============================================================================

export * from './relations';
