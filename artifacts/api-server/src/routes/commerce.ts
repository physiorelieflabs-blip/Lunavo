import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { createClerkClient, getAuth } from "@clerk/express";
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
  ReviewBankTransferBody,
  ReviewBankTransferParams,
  ReviewBankTransferResponse,
  SubmitBankTransferBody,
  SubmitBankTransferResponse,
  UpdateMerchantStatusBody,
  UpdateMerchantStatusParams,
  UpdateMerchantStatusResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const ADMIN_EMAIL = "ifeoluwaolowu4@gmail.com";
const MONTHLY_FEE = 30;
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

type Identity = {
  clerkUserId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  isAdmin: boolean;
};

type Merchant = typeof merchantsTable.$inferSelect;
type Subscription = typeof subscriptionsTable.$inferSelect;
type Payment = typeof paymentsTable.$inferSelect;

function toNumber(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function daysSince(date: Date): number {
  return Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

async function getIdentity(req: Request): Promise<Identity | null> {
  const auth = getAuth(req);
  if (!auth?.userId) return null;

  const user = await clerk.users.getUser(auth.userId);
  const primary =
    user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    ) ?? user.emailAddresses[0];
  const email = primary?.emailAddress.toLowerCase();
  const emailVerified = primary?.verification?.status === "verified";
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    undefined;

  if (!email) {
    throw new Error("Authenticated Clerk user has no email address");
  }

  return {
    clerkUserId: auth.userId,
    email,
    name: name || email.split("@")[0],
    emailVerified,
    isAdmin: email === ADMIN_EMAIL && emailVerified,
  };
}

async function requireIdentity(req: Request, res: Response) {
  const identity = await getIdentity(req);
  if (!identity) {
    res.status(401).json({ error: "Sign in required" });
    return null;
  }
  return identity;
}

async function requireAdmin(req: Request, res: Response) {
  const identity = await requireIdentity(req, res);
  if (!identity) return null;
  if (!identity.isAdmin) {
    res.status(403).json({ error: "Master admin access required" });
    return null;
  }
  return identity;
}

async function getOrCreateMerchant(identity: Identity): Promise<Merchant> {
  let merchant = (
    await db
      .select()
      .from(merchantsTable)
      .where(eq(merchantsTable.clerkUserId, identity.clerkUserId))
      .limit(1)
  )[0];

  if (!merchant) {
    merchant = (
      await db
        .select()
        .from(merchantsTable)
        .where(
          and(
            eq(merchantsTable.email, identity.email),
            isNull(merchantsTable.clerkUserId),
          ),
        )
        .limit(1)
    )[0];
  }

  if (merchant) {
    if (
      merchant.clerkUserId === null &&
      !identity.emailVerified
    ) {
      throw new Error("A verified email is required to claim this account");
    }
    if (
      merchant.clerkUserId !== identity.clerkUserId ||
      merchant.name !== identity.name ||
      merchant.email !== identity.email
    ) {
      [merchant] = await db
        .update(merchantsTable)
        .set({
          clerkUserId: identity.clerkUserId,
          name: identity.name,
          email: identity.email,
        })
        .where(eq(merchantsTable.id, merchant.id))
        .returning();
    }
    await getSubscriptionForMerchant(merchant, identity.isAdmin);
    return merchant;
  }

  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(merchantsTable)
      .values({
        clerkUserId: identity.clerkUserId,
        name: identity.name,
        email: identity.email,
        storeName: identity.isAdmin ? "TS Commerce" : `${identity.name}'s Store`,
      })
      .onConflictDoNothing()
      .returning();
    const created =
      inserted ??
      (
        await tx
          .select()
          .from(merchantsTable)
          .where(eq(merchantsTable.clerkUserId, identity.clerkUserId))
          .limit(1)
      )[0];
    if (!created) throw new Error("Could not create merchant account");
    await tx.insert(subscriptionsTable).values({
      merchantId: created.id,
      amountDue: identity.isAdmin ? "0" : MONTHLY_FEE.toFixed(2),
      status: identity.isAdmin ? "active" : "pending",
    }).onConflictDoNothing({ target: subscriptionsTable.merchantId });
    return created;
  });
}

async function getSubscriptionForMerchant(
  merchant: Merchant,
  isAdmin = false,
): Promise<Subscription> {
  let subscription = (
    await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.merchantId, merchant.id))
      .limit(1)
  )[0];
  if (!subscription) {
    [subscription] = await db
      .insert(subscriptionsTable)
      .values({
        merchantId: merchant.id,
        amountDue: isAdmin ? "0" : MONTHLY_FEE.toFixed(2),
        status: isAdmin ? "active" : "pending",
      })
      .onConflictDoNothing({ target: subscriptionsTable.merchantId })
      .returning();
    if (!subscription) {
      subscription = (
        await db
          .select()
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.merchantId, merchant.id))
          .limit(1)
      )[0];
    }
  }
  const requiredAmount = isAdmin ? 0 : MONTHLY_FEE;
  if (toNumber(subscription.amountDue) !== requiredAmount) {
    [subscription] = await db
      .update(subscriptionsTable)
      .set({
        amountDue: requiredAmount.toFixed(2),
        status:
          isAdmin || toNumber(subscription.amountPaid) >= requiredAmount
            ? "active"
            : subscription.status === "expired"
              ? "expired"
              : "pending",
      })
      .where(eq(subscriptionsTable.id, subscription.id))
      .returning();
  }
  return subscription;
}

async function addActivity(
  merchantId: number,
  values: Omit<
    typeof activityTable.$inferInsert,
    "merchantId" | "occurredAt" | "id"
  >,
) {
  await db.insert(activityTable).values({ merchantId, ...values });
}

async function enforceSubscription(merchant: Merchant, isAdmin = false) {
  let subscription = await getSubscriptionForMerchant(merchant, isAdmin);
  if (isAdmin) {
    if (
      toNumber(subscription.amountDue) !== 0 ||
      subscription.status !== "active"
    ) {
      [subscription] = await db
        .update(subscriptionsTable)
        .set({ amountDue: "0", amountPaid: "0", status: "active" })
        .where(eq(subscriptionsTable.id, subscription.id))
        .returning();
    }
    return { merchant, subscription };
  }

  const remaining = Math.max(
    0,
    toNumber(subscription.amountDue) - toNumber(subscription.amountPaid),
  );
  const days = daysSince(merchant.registeredAt);

  if (remaining === 0 && subscription.status !== "active") {
    [subscription] = await db
      .update(subscriptionsTable)
      .set({ status: "active" })
      .where(eq(subscriptionsTable.id, subscription.id))
      .returning();
  } else if (remaining > 0 && days >= 15) {
    const wasSuspended = merchant.status === "suspended";
    if (!wasSuspended && merchant.status !== "banned") {
      [merchant] = await db
        .update(merchantsTable)
        .set({ status: "suspended" })
        .where(eq(merchantsTable.id, merchant.id))
        .returning();
      await addActivity(merchant.id, {
        type: "subscription_suspended",
        title: "Account suspended",
        description:
          "The platform fee was not settled by day 15. A verified payment restores access.",
        amount: remaining.toFixed(2),
        tone: "negative",
      });
    }
    if (subscription.status !== "expired") {
      [subscription] = await db
        .update(subscriptionsTable)
        .set({ status: "expired" })
        .where(eq(subscriptionsTable.id, subscription.id))
        .returning();
    }
  } else if (
    remaining > 0 &&
    days >= 10 &&
    subscription.status === "pending"
  ) {
    [subscription] = await db
      .update(subscriptionsTable)
      .set({ status: "past_due" })
      .where(eq(subscriptionsTable.id, subscription.id))
      .returning();
    await addActivity(merchant.id, {
      type: "subscription_warning",
      title: "Platform fee reminder",
      description: `Your platform fee must be settled within ${15 - days} days to avoid suspension.`,
      amount: remaining.toFixed(2),
      tone: "warning",
    });
  }
  return { merchant, subscription };
}

function serializeSubscription(
  merchant: Merchant,
  subscription: Subscription,
  isAdmin = false,
) {
  const days = daysSince(merchant.registeredAt);
  const admin = isAdmin;
  const paid = toNumber(subscription.amountPaid);
  const remaining = Math.max(0, toNumber(subscription.amountDue) - paid);
  let nextAction = admin
    ? "Master admin account — subscription exempt"
    : remaining === 0
      ? "Subscription settled"
      : `Apply $${remaining.toFixed(2)} from earnings or submit a bank transfer`;
  if (!admin && days >= 10 && days < 15 && remaining > 0) {
    nextAction = `Warning: ${15 - days} days left to settle your subscription`;
  }
  if (!admin && days >= 15 && remaining > 0) {
    nextAction =
      "Account suspended — submit a bank transfer for admin review to restore access";
  }
  return {
    id: subscription.id,
    email: merchant.email,
    isAdmin: admin,
    amountDue: toNumber(subscription.amountDue),
    amountPaid: paid,
    earningsHeld: toNumber(subscription.earningsHeld),
    status:
      admin || remaining === 0
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

function serializePayment(payment: Payment, merchantName: string) {
  return {
    id: payment.id,
    merchantName,
    amount: toNumber(payment.amount),
    currency: payment.currency,
    method: payment.method,
    reference: payment.reference,
    senderName: payment.senderName,
    status: payment.status,
    reviewNote: payment.reviewNote,
    reviewedAt: payment.reviewedAt,
    createdAt: payment.createdAt,
  };
}

async function payFromEarnings(merchant: Merchant) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from ${subscriptionsTable} where ${subscriptionsTable.merchantId} = ${merchant.id} for update`,
    );
    const subscription = (
      await tx
        .select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.merchantId, merchant.id))
        .limit(1)
    )[0];
    if (!subscription) throw new Error("Subscription not found");
    const reference = `EARN-SUB-${subscription.id}`;
    const priorPayment = (
      await tx
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.reference, reference))
        .limit(1)
    )[0];
    if (priorPayment) {
      const settled =
        toNumber(subscription.amountPaid) >= toNumber(subscription.amountDue);
      if (
        priorPayment.merchantId !== merchant.id ||
        priorPayment.method !== "earnings" ||
        priorPayment.status !== "confirmed" ||
        !settled
      ) {
        throw new Error(
          "The internal earnings payment key is unavailable; no funds were applied",
        );
      }
      return { payment: priorPayment, subscription };
    }

    const remaining = Math.max(
      0,
      toNumber(subscription.amountDue) - toNumber(subscription.amountPaid),
    );
    if (remaining === 0) {
      throw new Error("Subscription is already settled");
    }
    if (toNumber(subscription.earningsHeld) < remaining) {
      throw new Error("Not enough held earnings to pay the subscription");
    }

    const [updatedSubscription] = await tx
      .update(subscriptionsTable)
      .set({
        amountPaid: (toNumber(subscription.amountPaid) + remaining).toFixed(2),
        earningsHeld: (
          toNumber(subscription.earningsHeld) - remaining
        ).toFixed(2),
        paymentMethod: "earnings",
        status: "active",
      })
      .where(
        and(
          eq(subscriptionsTable.id, subscription.id),
          eq(subscriptionsTable.amountPaid, subscription.amountPaid),
          eq(subscriptionsTable.earningsHeld, subscription.earningsHeld),
        ),
      )
      .returning();
    if (!updatedSubscription) {
      throw new Error("Subscription changed while payment was processing");
    }

    const [payment] = await tx
      .insert(paymentsTable)
      .values({
        merchantId: merchant.id,
        amount: remaining.toFixed(2),
        method: "earnings",
        reference,
        status: "confirmed",
        reviewedAt: new Date(),
      })
      .returning();
    if (merchant.status !== "banned") {
      await tx
        .update(merchantsTable)
        .set({ status: "active" })
        .where(eq(merchantsTable.id, merchant.id));
    }
    await tx.insert(activityTable).values({
      merchantId: merchant.id,
      type: "subscription_payment",
      title: "Platform fee paid from earnings",
      description: "Held earnings were applied to your platform fee.",
      amount: remaining.toFixed(2),
      tone: "negative",
    });
    return { payment, subscription: updatedSubscription };
  });
}

router.get("/dashboard/overview", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const enforced = await enforceSubscription(merchant, identity.isAdmin);
  const subscription = serializeSubscription(
    enforced.merchant,
    enforced.subscription,
    identity.isAdmin,
  );
  res.json(
    GetDashboardOverviewResponse.parse({
      storeName: enforced.merchant.storeName,
      storeSlug: enforced.merchant.storeName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
      revenue: 0,
      revenueChange: 0,
      orders: 0,
      customers: 0,
      availableBalance: 0,
      pendingBalance: 0,
      earningsHeldForSubscription: subscription.earningsHeld,
      subscription,
      revenueSeries: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
        (label) => ({ label, amount: 0 }),
      ),
    }),
  );
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
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
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const merchant = await getOrCreateMerchant(identity);
  const enforced = await enforceSubscription(merchant, identity.isAdmin);
  res.json(
    GetSubscriptionResponse.parse(
      serializeSubscription(
        enforced.merchant,
        enforced.subscription,
        identity.isAdmin,
      ),
    ),
  );
});

router.post("/subscription", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const parsed = CreateSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid subscription payment method" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  if (identity.isAdmin) {
    const subscription = await getSubscriptionForMerchant(
      merchant,
      identity.isAdmin,
    );
    res
      .status(201)
      .json(
        CreateSubscriptionResponse.parse(
          serializeSubscription(merchant, subscription, identity.isAdmin),
        ),
      );
    return;
  }
  if (parsed.data.method === "earnings") {
    try {
      const result = await payFromEarnings(merchant);
      res
        .status(201)
        .json(
          CreateSubscriptionResponse.parse(
            serializeSubscription(merchant, result.subscription),
          ),
        );
    } catch (error) {
      res
        .status(409)
        .json({ error: error instanceof Error ? error.message : "Payment failed" });
    }
    return;
  }
  const subscription = await getSubscriptionForMerchant(
    merchant,
    identity.isAdmin,
  );
  const [updated] = await db
    .update(subscriptionsTable)
    .set({ paymentMethod: "bank" })
    .where(eq(subscriptionsTable.id, subscription.id))
    .returning();
  res
    .status(201)
    .json(
      CreateSubscriptionResponse.parse(
        serializeSubscription(merchant, updated),
      ),
    );
});

router.post("/subscription/use-earnings", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  if (identity.isAdmin) {
    res.status(409).json({ error: "Master admin account is subscription exempt" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  try {
    const { payment } = await payFromEarnings(merchant);
    res
      .status(201)
      .json(
        PaySubscriptionFromEarningsResponse.parse(
          serializePayment(payment, merchant.name),
        ),
      );
  } catch (error) {
    res
      .status(409)
      .json({ error: error instanceof Error ? error.message : "Payment failed" });
  }
});

router.post("/subscription/bank-transfer", async (req, res): Promise<void> => {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  if (identity.isAdmin) {
    res.status(409).json({ error: "Master admin account is subscription exempt" });
    return;
  }
  const parsed = SubmitBankTransferBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Sender name and transfer reference are required" });
    return;
  }
  const merchant = await getOrCreateMerchant(identity);
  const enforced = await enforceSubscription(merchant, identity.isAdmin);
  const remaining = Math.max(
    0,
    toNumber(enforced.subscription.amountDue) -
      toNumber(enforced.subscription.amountPaid),
  );
  if (remaining === 0) {
    res.status(409).json({ error: "Subscription is already settled" });
    return;
  }
  const reference = parsed.data.reference.trim().toUpperCase();
  if (reference.startsWith("EARN-SUB-")) {
    res.status(400).json({
      error: "That reference format is reserved for internal earnings payments",
    });
    return;
  }
  const existing = (
    await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.reference, reference))
      .limit(1)
  )[0];
  if (existing) {
    if (existing.merchantId === merchant.id) {
      res.json(
        SubmitBankTransferResponse.parse(
          serializePayment(existing, merchant.name),
        ),
      );
      return;
    }
    res.status(409).json({
      error: "This transfer reference is already associated with another account",
    });
    return;
  }

  try {
    const payment = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(paymentsTable)
      .values({
        merchantId: merchant.id,
        amount: remaining.toFixed(2),
        method: "bank_transfer",
        reference,
        senderName: parsed.data.senderName.trim(),
        status: "under_review",
      })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      const prior = (
        await tx
          .select()
          .from(paymentsTable)
          .where(eq(paymentsTable.reference, reference))
          .limit(1)
      )[0];
      if (prior?.merchantId === merchant.id) return prior;
      throw new Error(
        "This transfer reference is already associated with another account",
      );
    }
    await tx
      .update(subscriptionsTable)
      .set({
        paymentMethod: "bank",
        status:
          enforced.merchant.status === "suspended" ? "expired" : "past_due",
      })
      .where(eq(subscriptionsTable.id, enforced.subscription.id));
    await tx.insert(activityTable).values({
      merchantId: merchant.id,
      type: "bank_transfer_submitted",
      title: "Bank transfer submitted",
      description: `Transfer ${reference} is waiting for admin review.`,
      amount: remaining.toFixed(2),
      tone: "neutral",
    });
    return created;
    });
    res
      .status(201)
      .json(
        SubmitBankTransferResponse.parse(
          serializePayment(payment, merchant.name),
        ),
      );
  } catch (error) {
    res.status(409).json({
      error:
        error instanceof Error
          ? error.message
          : "Transfer reference could not be submitted",
    });
  }
});

router.get("/admin/overview", async (req, res): Promise<void> => {
  const identity = await requireAdmin(req, res);
  if (!identity) return;
  const merchants = await db.select().from(merchantsTable);
  const subs = await db.select().from(subscriptionsTable);
  const payments = await db
    .select({
      payment: paymentsTable,
      merchantName: merchantsTable.name,
    })
    .from(paymentsTable)
    .innerJoin(merchantsTable, eq(paymentsTable.merchantId, merchantsTable.id))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(20);
  const confirmedPayments = await db
    .select({ amount: paymentsTable.amount })
    .from(paymentsTable)
    .where(eq(paymentsTable.status, "confirmed"));
  const nonAdminMerchants = merchants.filter(
    (merchant) => merchant.clerkUserId !== identity.clerkUserId,
  );
  const subscriptionByMerchant = new Map(
    subs.map((subscription) => [subscription.merchantId, subscription]),
  );
  const confirmedRevenue = confirmedPayments.reduce(
    (sum, payment) => sum + toNumber(payment.amount),
    0,
  );
  res.json(
    GetAdminOverviewResponse.parse({
      platformRevenue: confirmedRevenue,
      subscriptionRevenue: confirmedRevenue,
      heldMerchantRevenue: subs.reduce(
        (sum, sub) => sum + toNumber(sub.earningsHeld),
        0,
      ),
      activeMerchants: nonAdminMerchants.filter(
        (merchant) => merchant.status === "active",
      ).length,
      attentionRequired: nonAdminMerchants.filter(
        (merchant) => {
          const subscription = subscriptionByMerchant.get(merchant.id);
          const outstanding = Math.max(
            0,
            toNumber(subscription?.amountDue) -
              toNumber(subscription?.amountPaid),
          );
          return (
            outstanding > 0 &&
            (daysSince(merchant.registeredAt) >= 10 ||
              merchant.status === "suspended")
          );
        },
      ).length,
      suspendedAccounts: nonAdminMerchants.filter(
        (merchant) => merchant.status === "suspended",
      ).length,
      recentPayments: payments.map(({ payment, merchantName }) =>
        serializePayment(payment, merchantName),
      ),
    }),
  );
});

router.get("/admin/merchants", async (req, res): Promise<void> => {
  const identity = await requireAdmin(req, res);
  if (!identity) return;
  const merchants = await db
    .select()
    .from(merchantsTable)
    .orderBy(desc(merchantsTable.registeredAt));
  const rows = await Promise.all(
    merchants.map(async (merchant) => {
      const isVerifiedAdminMerchant =
        identity.isAdmin &&
        merchant.clerkUserId === identity.clerkUserId;
      const enforced = await enforceSubscription(
        merchant,
        isVerifiedAdminMerchant,
      );
      return {
        id: enforced.merchant.id,
        name: enforced.merchant.name,
        email: enforced.merchant.email,
        storeName: enforced.merchant.storeName,
        status: enforced.merchant.status,
        subscriptionStatus:
          isVerifiedAdminMerchant
            ? "active"
            : enforced.subscription.status,
        amountPaid: toNumber(enforced.subscription.amountPaid),
        amountDue:
          isVerifiedAdminMerchant
            ? 0
            : toNumber(enforced.subscription.amountDue),
        earningsHeld: toNumber(enforced.subscription.earningsHeld),
        registeredAt: enforced.merchant.registeredAt,
        daysSinceRegistration: daysSince(enforced.merchant.registeredAt),
      };
    }),
  );
  res.json(ListMerchantsResponse.parse(rows));
});

router.patch("/admin/merchants/:id/status", async (req, res): Promise<void> => {
  const identity = await requireAdmin(req, res);
  if (!identity) return;
  const params = UpdateMerchantStatusParams.safeParse(req.params);
  const body = UpdateMerchantStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid merchant status update" });
    return;
  }
  const existing = (
    await db
      .select()
      .from(merchantsTable)
      .where(eq(merchantsTable.id, params.data.id))
      .limit(1)
  )[0];
  if (!existing) {
    res.status(404).json({ error: "Merchant not found" });
    return;
  }
  if (
    identity.isAdmin &&
    existing.clerkUserId === identity.clerkUserId
  ) {
    res.status(403).json({ error: "The master admin account cannot be suspended" });
    return;
  }
  const [merchant] = await db
    .update(merchantsTable)
    .set({ status: body.data.status })
    .where(eq(merchantsTable.id, existing.id))
    .returning();
  await addActivity(merchant.id, {
    type: "admin_status_change",
    title: `Account ${body.data.status}`,
    description: `The master admin changed account access to ${body.data.status}.`,
    tone: body.data.status === "active" ? "positive" : "warning",
  });
  const subscription = await getSubscriptionForMerchant(merchant);
  res.json(
    UpdateMerchantStatusResponse.parse({
      id: merchant.id,
      name: merchant.name,
      email: merchant.email,
      storeName: merchant.storeName,
      status: merchant.status,
      subscriptionStatus: subscription.status,
      amountPaid: toNumber(subscription.amountPaid),
      amountDue: toNumber(subscription.amountDue),
      earningsHeld: toNumber(subscription.earningsHeld),
      registeredAt: merchant.registeredAt,
      daysSinceRegistration: daysSince(merchant.registeredAt),
    }),
  );
});

router.patch("/admin/payments/:id/review", async (req, res): Promise<void> => {
  const identity = await requireAdmin(req, res);
  if (!identity) return;
  const params = ReviewBankTransferParams.safeParse(req.params);
  const body = ReviewBankTransferBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid payment review" });
    return;
  }

  const existing = (
    await db
      .select({ payment: paymentsTable, merchant: merchantsTable })
      .from(paymentsTable)
      .innerJoin(merchantsTable, eq(paymentsTable.merchantId, merchantsTable.id))
      .where(eq(paymentsTable.id, params.data.id))
      .limit(1)
  )[0];
  if (!existing) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  if (existing.payment.method !== "bank_transfer") {
    res.status(409).json({ error: "Only pending bank transfers can be reviewed" });
    return;
  }
  if (existing.payment.status === body.data.status) {
    res.json(
      ReviewBankTransferResponse.parse(
        serializePayment(existing.payment, existing.merchant.name),
      ),
    );
    return;
  }
  if (existing.payment.status !== "under_review") {
    res.status(409).json({ error: "This transfer already has a final review" });
    return;
  }

  try {
    const reviewed = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from ${subscriptionsTable} where ${subscriptionsTable.merchantId} = ${existing.merchant.id} for update`,
      );
      const currentPayment = (
        await tx
          .select()
          .from(paymentsTable)
          .where(eq(paymentsTable.id, existing.payment.id))
          .limit(1)
      )[0];
      if (!currentPayment) throw new Error("Payment not found");
      if (currentPayment.status === body.data.status) return currentPayment;
      if (currentPayment.status !== "under_review") {
        throw new Error("This transfer already has a final review");
      }

      const subscription = (
        await tx
          .select()
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.merchantId, existing.merchant.id))
          .limit(1)
      )[0];
      if (!subscription) throw new Error("Subscription not found");

      if (body.data.status === "confirmed") {
        const outstanding = Math.max(
          0,
          toNumber(subscription.amountDue) -
            toNumber(subscription.amountPaid),
        );
        const paymentAmount = toNumber(currentPayment.amount);
        if (outstanding === 0) {
          throw new Error(
            "The subscription is already settled; this transfer was not confirmed",
          );
        }
        if (paymentAmount > outstanding) {
          throw new Error(
            "The transfer exceeds the current outstanding balance and needs manual reconciliation",
          );
        }
      }

      const [payment] = await tx
        .update(paymentsTable)
        .set({
          status: body.data.status,
          reviewedBy: identity.clerkUserId,
          reviewNote: body.data.note?.trim() || null,
          reviewedAt: new Date(),
        })
        .where(
          and(
            eq(paymentsTable.id, existing.payment.id),
            eq(paymentsTable.status, "under_review"),
          ),
        )
        .returning();
      if (!payment) throw new Error("Payment was already reviewed");

      if (body.data.status === "confirmed") {
        const amountPaid =
          toNumber(subscription.amountPaid) + toNumber(payment.amount);
        const settled = amountPaid >= toNumber(subscription.amountDue);
        await tx
          .update(subscriptionsTable)
          .set({
            amountPaid: amountPaid.toFixed(2),
            paymentMethod: "bank",
            status: settled ? "active" : "past_due",
          })
          .where(eq(subscriptionsTable.id, subscription.id));
        if (settled && existing.merchant.status !== "banned") {
          await tx
            .update(merchantsTable)
            .set({ status: "active" })
            .where(eq(merchantsTable.id, existing.merchant.id));
        }
      }

      await tx.insert(activityTable).values({
        merchantId: existing.merchant.id,
        type: "bank_transfer_reviewed",
        title:
          body.data.status === "confirmed"
            ? "Bank transfer approved"
            : "Bank transfer rejected",
        description:
          body.data.note?.trim() ||
          (body.data.status === "confirmed"
            ? "Your bank transfer was verified and applied to the platform fee."
            : "Your bank transfer could not be verified. Submit a valid reference to try again."),
        amount: payment.amount,
        tone: body.data.status === "confirmed" ? "positive" : "negative",
      });
      return payment;
    });
    res.json(
      ReviewBankTransferResponse.parse(
        serializePayment(reviewed, existing.merchant.name),
      ),
    );
  } catch (error) {
    res
      .status(409)
      .json({ error: error instanceof Error ? error.message : "Review failed" });
  }
});

export default router;