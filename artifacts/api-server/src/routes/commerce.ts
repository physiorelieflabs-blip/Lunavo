import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  activityTable,
  db,
  merchantsTable,
  paymentsTable,
  subscriptionsTable,
} from "@workspace/db";
import {
  CreateSubscriptionBody,
  CreateSubscriptionResponse,
  GetAdminOverviewResponse,
  GetDashboardOverviewResponse,
  GetSubscriptionResponse,
  ListDashboardActivityResponse,
  ListMerchantsResponse,
  PaySubscriptionFromEarningsResponse,
  SubmitBankTransferBody,
  SubmitBankTransferResponse,
  UpdateMerchantStatusBody,
  UpdateMerchantStatusParams,
  UpdateMerchantStatusResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const ADMIN_EMAIL = "ifeoluwaolowu4@gmail.com";
const MONTHLY_FEE = 30;
const PREVIEW_MODE = process.env.NODE_ENV !== "production";

type Identity = {
  clerkUserId: string | null;
  email: string;
  name: string;
  isAdmin: boolean;
};

function getIdentity(req: Request): Identity {
  const auth = getAuth(req);
  const claims = (auth?.sessionClaims ?? {}) as Record<string, unknown>;
  const email =
    (typeof claims.email === "string" && claims.email) ||
    (typeof claims.email_address === "string" && claims.email_address) ||
    (PREVIEW_MODE ? "merchant@demo.tscommerce.local" : "");
  const name =
    (typeof claims.name === "string" && claims.name) ||
    (typeof claims.given_name === "string" && claims.given_name) ||
    "New merchant";
  return {
    clerkUserId: auth?.userId ?? null,
    email: email.toLowerCase(),
    name,
    isAdmin: email.toLowerCase() === ADMIN_EMAIL,
  };
}

function requireAuthenticated(req: Request): Identity | null {
  const identity = getIdentity(req);
  if (!identity.clerkUserId && !PREVIEW_MODE) return null;
  return identity;
}

function toNumber(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function daysSince(date: Date): number {
  return Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

async function seedPreviewData(): Promise<void> {
  if (!PREVIEW_MODE) return;
  const existing = await db.select({ id: merchantsTable.id }).from(merchantsTable);
  if (existing.length > 0) return;

  const [admin] = await db
    .insert(merchantsTable)
    .values({
      name: "TSAdmin",
      email: ADMIN_EMAIL,
      storeName: "TS Commerce",
      status: "active",
    })
    .returning();
  await db.insert(subscriptionsTable).values({
    merchantId: admin.id,
    amountDue: "0",
    amountPaid: "0",
    status: "active",
  });

  const [maya] = await db
    .insert(merchantsTable)
    .values({
      name: "Maya Okafor",
      email: "maya@example.com",
      storeName: "Maya Home",
      status: "active",
      registeredAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8),
    })
    .returning();
  await db.insert(subscriptionsTable).values({
    merchantId: maya.id,
    earningsHeld: "18.4",
    amountPaid: "0",
    status: "pending",
  });
  await db.insert(activityTable).values([
    {
      merchantId: maya.id,
      type: "order",
      title: "Order #1048 completed",
      description: "A new order was paid and added to your balance.",
      amount: "128",
      tone: "positive",
    },
    {
      merchantId: maya.id,
      type: "subscription",
      title: "Platform fee reminder",
      description: "Your $30 subscription is due in 7 days.",
      amount: "30",
      tone: "warning",
    },
  ]);

  const [atlas] = await db
    .insert(merchantsTable)
    .values({
      name: "Atlas Supply Co.",
      email: "atlas@example.com",
      storeName: "Atlas Supply",
      status: "suspended",
      registeredAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 21),
    })
    .returning();
  await db.insert(subscriptionsTable).values({
    merchantId: atlas.id,
    earningsHeld: "11.75",
    amountPaid: "0",
    status: "expired",
  });
}

async function getOrCreateMerchant(identity: Identity) {
  await seedPreviewData();
  let merchant = identity.clerkUserId
    ? (
        await db
          .select()
          .from(merchantsTable)
          .where(eq(merchantsTable.clerkUserId, identity.clerkUserId))
          .limit(1)
      )[0]
    : undefined;
  if (!merchant) {
    merchant = (
      await db
        .select()
        .from(merchantsTable)
        .where(eq(merchantsTable.email, identity.email))
        .limit(1)
    )[0];
  }
  if (!merchant && identity.clerkUserId) {
    merchant = (
      await db
        .insert(merchantsTable)
        .values({
          clerkUserId: identity.clerkUserId,
          name: identity.name,
          email: identity.email,
          storeName: `${identity.name}'s Store`,
        })
        .returning()
    )[0];
    await db.insert(subscriptionsTable).values({ merchantId: merchant.id });
  }
  if (!merchant) {
    merchant = (
      await db
        .select()
        .from(merchantsTable)
        .where(eq(merchantsTable.email, "maya@example.com"))
        .limit(1)
    )[0];
  }
  return merchant;
}

async function getSubscriptionForMerchant(merchantId: number) {
  let subscription = (
    await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.merchantId, merchantId))
      .limit(1)
  )[0];
  if (!subscription) {
    subscription = (
      await db
        .insert(subscriptionsTable)
        .values({ merchantId })
        .returning()
    )[0];
  }
  return subscription;
}

async function enforceSubscription(merchant: typeof merchantsTable.$inferSelect) {
  const subscription = await getSubscriptionForMerchant(merchant.id);
  if (
    merchant.email !== ADMIN_EMAIL &&
    daysSince(merchant.registeredAt) >= 15 &&
    toNumber(subscription.amountPaid) < toNumber(subscription.amountDue) &&
    merchant.status !== "suspended"
  ) {
    const [updatedMerchant] = await db
      .update(merchantsTable)
      .set({ status: "suspended" })
      .where(eq(merchantsTable.id, merchant.id))
      .returning();
    const [updatedSubscription] = await db
      .update(subscriptionsTable)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(subscriptionsTable.id, subscription.id))
      .returning();
    return { merchant: updatedMerchant, subscription: updatedSubscription };
  }
  return { merchant, subscription };
}

function serializeSubscription(
  merchant: typeof merchantsTable.$inferSelect,
  subscription: typeof subscriptionsTable.$inferSelect,
) {
  const days = daysSince(merchant.registeredAt);
  const admin = merchant.email === ADMIN_EMAIL;
  const paid = toNumber(subscription.amountPaid);
  const held = toNumber(subscription.earningsHeld);
  const remaining = Math.max(0, toNumber(subscription.amountDue) - paid);
  let nextAction = admin
    ? "Master admin account — subscription exempt"
    : `Apply $${remaining.toFixed(2)} from earnings or pay by bank`;
  if (!admin && days >= 10 && days < 15 && remaining > 0) {
    nextAction = `Warning: ${15 - days} days left to settle your subscription`;
  }
  if (!admin && days >= 15 && remaining > 0) {
    nextAction = "Account suspended — pay by bank transfer to restore access";
  }
  return {
    id: subscription.id,
    email: merchant.email,
    isAdmin: admin,
    amountDue: toNumber(subscription.amountDue),
    amountPaid: paid,
    earningsHeld: held,
    status:
      admin
        ? "active"
        : merchant.status === "suspended"
          ? "suspended"
          : subscription.status,
    registeredAt: merchant.registeredAt,
    warningDay: 10,
    suspensionDay: 15,
    nextAction,
    paymentMethod: subscription.paymentMethod,
  };
}

router.get("/dashboard/overview", async (req, res): Promise<void> => {
  const identity = requireAuthenticated(req);
  if (!identity) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const enforced = await enforceSubscription(merchant);
  const subscription = serializeSubscription(
    enforced.merchant,
    enforced.subscription,
  );
  const isPreviewMerchant = enforced.merchant.email === "maya@example.com";
  const revenue = isPreviewMerchant ? 12480 : 0;
  const overview = {
    storeName: enforced.merchant.storeName,
    storeSlug: enforced.merchant.storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    revenue,
    revenueChange: isPreviewMerchant ? 12.4 : 0,
    orders: isPreviewMerchant ? 184 : 0,
    customers: isPreviewMerchant ? 96 : 0,
    availableBalance: isPreviewMerchant
      ? Math.max(0, 4820 - subscription.earningsHeld)
      : 0,
    pendingBalance: isPreviewMerchant ? 620 : 0,
    earningsHeldForSubscription: subscription.earningsHeld,
    subscription,
    revenueSeries: [
      { label: "Mon", amount: isPreviewMerchant ? 1480 : 0 },
      { label: "Tue", amount: isPreviewMerchant ? 1920 : 0 },
      { label: "Wed", amount: isPreviewMerchant ? 1640 : 0 },
      { label: "Thu", amount: isPreviewMerchant ? 2180 : 0 },
      { label: "Fri", amount: isPreviewMerchant ? 1760 : 0 },
      { label: "Sat", amount: isPreviewMerchant ? 2380 : 0 },
      { label: "Sun", amount: isPreviewMerchant ? 1120 : 0 },
    ],
  };
  res.json(GetDashboardOverviewResponse.parse(overview));
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  const identity = requireAuthenticated(req);
  if (!identity) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const activity = await db
    .select()
    .from(activityTable)
    .where(eq(activityTable.merchantId, merchant.id))
    .orderBy(desc(activityTable.occurredAt))
    .limit(10);
  res.json(
    ListDashboardActivityResponse.parse(
      activity.map((item) => ({
        ...item,
        amount: item.amount === null ? null : toNumber(item.amount),
      })),
    ),
  );
});

router.get("/subscription", async (req, res): Promise<void> => {
  const identity = requireAuthenticated(req);
  if (!identity) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const enforced = await enforceSubscription(merchant);
  res.json(
    GetSubscriptionResponse.parse(
      serializeSubscription(enforced.merchant, enforced.subscription),
    ),
  );
});

router.post("/subscription", async (req, res): Promise<void> => {
  const identity = requireAuthenticated(req);
  if (!identity) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  const parsed = CreateSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const subscription = await getSubscriptionForMerchant(merchant.id);
  if (parsed.data.method === "earnings") {
    if (
      toNumber(subscription.earningsHeld) <
      Math.max(0, toNumber(subscription.amountDue) - toNumber(subscription.amountPaid))
    ) {
      res.status(400).json({ error: "Not enough held earnings to pay the subscription" });
      return;
    }
    const remaining = Math.max(
      0,
      toNumber(subscription.amountDue) - toNumber(subscription.amountPaid),
    );
    const [updated] = await db
      .update(subscriptionsTable)
      .set({
        amountPaid: sql`${subscriptionsTable.amountPaid} + ${remaining}`,
        earningsHeld: sql`${subscriptionsTable.earningsHeld} - ${remaining}`,
        paymentMethod: "earnings",
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.id, subscription.id))
      .returning();
    await db
      .update(merchantsTable)
      .set({ status: "active" })
      .where(eq(merchantsTable.id, merchant.id));
    const [payment] = await db
      .insert(paymentsTable)
      .values({
        merchantId: merchant.id,
        amount: remaining.toFixed(2),
        method: "earnings",
        reference: `EARN-${Date.now()}`,
        status: "confirmed",
      })
      .returning();
    res.status(201).json(
      CreateSubscriptionResponse.parse(serializeSubscription(merchant, updated)),
    );
    return;
  }
  const [updated] = await db
    .update(subscriptionsTable)
    .set({ paymentMethod: "bank", status: "pending", updatedAt: new Date() })
    .where(eq(subscriptionsTable.id, subscription.id))
    .returning();
  res.status(201).json(
    CreateSubscriptionResponse.parse(serializeSubscription(merchant, updated)),
  );
});

router.post("/subscription/use-earnings", async (req, res): Promise<void> => {
  const identity = requireAuthenticated(req);
  if (!identity) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const subscription = await getSubscriptionForMerchant(merchant.id);
  const remaining = Math.max(
    0,
    toNumber(subscription.amountDue) - toNumber(subscription.amountPaid),
  );
  if (toNumber(subscription.earningsHeld) < remaining) {
    res.status(400).json({ error: "Not enough held earnings to pay the subscription" });
    return;
  }
  const [updated] = await db
    .update(subscriptionsTable)
    .set({
      amountPaid: sql`${subscriptionsTable.amountPaid} + ${remaining}`,
      earningsHeld: sql`${subscriptionsTable.earningsHeld} - ${remaining}`,
      paymentMethod: "earnings",
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(subscriptionsTable.id, subscription.id))
    .returning();
  const [payment] = await db
    .insert(paymentsTable)
    .values({
      merchantId: merchant.id,
      amount: remaining.toFixed(2),
      method: "earnings",
      reference: `EARN-${Date.now()}`,
      status: "confirmed",
    })
    .returning();
  await db
    .update(merchantsTable)
    .set({ status: "active" })
    .where(eq(merchantsTable.id, merchant.id));
  res.status(201).json(
    PaySubscriptionFromEarningsResponse.parse({
      id: payment.id,
      merchantName: merchant.name,
      amount: toNumber(payment.amount),
      currency: payment.currency,
      method: payment.method,
      reference: payment.reference,
      status: payment.status,
      createdAt: payment.createdAt,
    }),
  );
});

router.post("/subscription/bank-transfer", async (req, res): Promise<void> => {
  const identity = requireAuthenticated(req);
  if (!identity) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  const parsed = SubmitBankTransferBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const [payment] = await db
    .insert(paymentsTable)
    .values({
      merchantId: merchant.id,
      amount: "30",
      method: "bank_transfer",
      reference: parsed.data.reference,
      status: "under_review",
    })
    .returning();
  const subscription = await getSubscriptionForMerchant(merchant.id);
  await db
    .update(subscriptionsTable)
    .set({ paymentMethod: "bank", status: "past_due", updatedAt: new Date() })
    .where(eq(subscriptionsTable.id, subscription.id));
  res.status(201).json(
    SubmitBankTransferResponse.parse({
      id: payment.id,
      merchantName: merchant.name,
      amount: toNumber(payment.amount),
      currency: payment.currency,
      method: payment.method,
      reference: payment.reference,
      status: payment.status,
      createdAt: payment.createdAt,
    }),
  );
});

router.get("/admin/overview", async (req, res): Promise<void> => {
  const identity = getIdentity(req);
  if (!identity.isAdmin && !PREVIEW_MODE) {
    res.status(403).json({ error: "Master admin access required" });
    return;
  }
  await seedPreviewData();
  const merchants = await db.select().from(merchantsTable);
  const subs = await db.select().from(subscriptionsTable);
  const payments = await db
    .select({
      id: paymentsTable.id,
      merchantName: merchantsTable.name,
      amount: paymentsTable.amount,
      currency: paymentsTable.currency,
      method: paymentsTable.method,
      reference: paymentsTable.reference,
      status: paymentsTable.status,
      createdAt: paymentsTable.createdAt,
    })
    .from(paymentsTable)
    .innerJoin(merchantsTable, eq(paymentsTable.merchantId, merchantsTable.id))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(8);
  const pendingMerchants = merchants.filter((merchant) => merchant.email !== ADMIN_EMAIL);
  const overview = {
    platformRevenue: 12480,
    subscriptionRevenue: subs.reduce((sum, sub) => sum + toNumber(sub.amountPaid), 0),
    heldMerchantRevenue: subs.reduce((sum, sub) => sum + toNumber(sub.earningsHeld), 0),
    activeMerchants: pendingMerchants.filter((m) => m.status === "active").length,
    attentionRequired: pendingMerchants.filter(
      (m) => daysSince(m.registeredAt) >= 10 || m.status === "suspended",
    ).length,
    suspendedAccounts: pendingMerchants.filter((m) => m.status === "suspended").length,
    recentPayments: payments.map((payment) => ({
      ...payment,
      amount: toNumber(payment.amount),
    })),
  };
  res.json(GetAdminOverviewResponse.parse(overview));
});

router.get("/admin/merchants", async (req, res): Promise<void> => {
  const identity = getIdentity(req);
  if (!identity.isAdmin && !PREVIEW_MODE) {
    res.status(403).json({ error: "Master admin access required" });
    return;
  }
  await seedPreviewData();
  const rows = await db
    .select({
      merchant: merchantsTable,
      subscription: subscriptionsTable,
    })
    .from(merchantsTable)
    .leftJoin(
      subscriptionsTable,
      eq(merchantsTable.id, subscriptionsTable.merchantId),
    )
    .orderBy(desc(merchantsTable.registeredAt));
  res.json(
    ListMerchantsResponse.parse(
      rows.map(({ merchant, subscription }) => ({
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        storeName: merchant.storeName,
        status: merchant.status,
        subscriptionStatus:
          merchant.email === ADMIN_EMAIL
            ? "active"
            : subscription?.status ?? "pending",
        amountPaid: toNumber(subscription?.amountPaid),
        amountDue: merchant.email === ADMIN_EMAIL ? 0 : toNumber(subscription?.amountDue ?? 30),
        earningsHeld: toNumber(subscription?.earningsHeld),
        registeredAt: merchant.registeredAt,
        daysSinceRegistration: daysSince(merchant.registeredAt),
      })),
    ),
  );
});

router.patch("/admin/merchants/:id/status", async (req, res): Promise<void> => {
  const identity = getIdentity(req);
  if (!identity.isAdmin && !PREVIEW_MODE) {
    res.status(403).json({ error: "Master admin access required" });
    return;
  }
  const params = UpdateMerchantStatusParams.safeParse(req.params);
  const body = UpdateMerchantStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid merchant status update" });
    return;
  }
  const [merchant] = await db
    .update(merchantsTable)
    .set({ status: body.data.status })
    .where(eq(merchantsTable.id, params.data.id))
    .returning();
  if (!merchant) {
    res.status(404).json({ error: "Merchant not found" });
    return;
  }
  const subscription = await getSubscriptionForMerchant(merchant.id);
  res.json(
    UpdateMerchantStatusResponse.parse({
      id: merchant.id,
      name: merchant.name,
      email: merchant.email,
      storeName: merchant.storeName,
      status: merchant.status,
      subscriptionStatus:
        merchant.email === ADMIN_EMAIL ? "active" : subscription.status,
      amountPaid: toNumber(subscription.amountPaid),
      amountDue:
        merchant.email === ADMIN_EMAIL ? 0 : toNumber(subscription.amountDue),
      earningsHeld: toNumber(subscription.earningsHeld),
      registeredAt: merchant.registeredAt,
      daysSinceRegistration: daysSince(merchant.registeredAt),
    }),
  );
});

export default router;