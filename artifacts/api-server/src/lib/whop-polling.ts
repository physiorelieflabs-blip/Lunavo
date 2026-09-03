import { and, eq, inArray, sql } from "drizzle-orm";
import {
  activityTable,
  db,
  invoicesTable,
  merchantsTable,
  ordersTable,
  paymentIntentsTable,
  paymentsTable,
  subscriptionsTable,
} from "@workspace/db";
import {
  isCustomerWhopConfigured,
  whopCompanyId,
  whopMoneyMajor,
  whopPlanId,
  whopRequest,
  type WhopPayment,
} from "./whop-client";

type PendingCheckout = {
  token: string | null;
  checkoutId: string | null;
};

async function verifyCheckout(
  baseUrl: string,
  path: string,
  checkout: PendingCheckout,
): Promise<void> {
  if (!checkout.token || !checkout.checkoutId) return;
  const response = await fetch(
    `${baseUrl}${path}/${encodeURIComponent(checkout.token)}/verify`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checkoutId: checkout.checkoutId }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status !== 409 && response.status !== 502) {
      console.warn("Whop polling verification failed", response.status, detail.slice(0, 300));
    }
  }
}

async function pollWhopCheckouts(baseUrl: string): Promise<void> {
  if (!isCustomerWhopConfigured()) return;

  const orderCheckouts = await db
    .select({
      token: ordersTable.publicPaymentToken,
      checkoutId: paymentIntentsTable.evidenceReference,
    })
    .from(paymentIntentsTable)
    .innerJoin(ordersTable, eq(paymentIntentsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(paymentIntentsTable.method, "whop_hosted"),
        inArray(paymentIntentsTable.status, ["created", "submitted"]),
      ),
    )
    .limit(100);

  for (const checkout of orderCheckouts) {
    try {
      await verifyCheckout(baseUrl, "/api/public/checkout", checkout);
    } catch (error) {
      console.warn(
        "Whop order polling request failed",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const invoices = await db.select().from(invoicesTable).limit(100);
  for (const invoice of invoices) {
    if (["draft", "paid", "void"].includes(invoice.status)) continue;
    const outstanding = Number(
      (Number(invoice.total) - Number(invoice.amountPaid)).toFixed(2),
    );
    if (outstanding <= 0) continue;
    const intent = (
      await db
        .select({
          status: paymentIntentsTable.status,
          evidenceReference: paymentIntentsTable.evidenceReference,
        })
        .from(paymentIntentsTable)
        .where(
          and(
            eq(
              paymentIntentsTable.idempotencyKey,
              `public-invoice:${invoice.id}:${outstanding.toFixed(2)}`,
            ),
            eq(paymentIntentsTable.merchantId, invoice.merchantId),
          ),
        )
        .limit(1)
    )[0];
    if (
      !intent ||
      !["created", "submitted"].includes(intent.status) ||
      !intent.evidenceReference
    ) {
      continue;
    }
    try {
      await verifyCheckout(baseUrl, "/api/public/invoices", {
        token: invoice.publicToken,
        checkoutId: intent.evidenceReference,
      });
    } catch (error) {
      console.warn(
        "Whop invoice polling request failed",
        error instanceof Error ? error.message : error,
      );
    }
  }
}

async function pollWhopSubscriptionPayments(): Promise<void> {
  const pending = await db
    .select({
      payment: paymentsTable,
      subscription: subscriptionsTable,
      merchant: merchantsTable,
    })
    .from(paymentsTable)
    .innerJoin(
      subscriptionsTable,
      eq(paymentsTable.merchantId, subscriptionsTable.merchantId),
    )
    .innerJoin(merchantsTable, eq(paymentsTable.merchantId, merchantsTable.id))
    .where(
      and(
        eq(paymentsTable.method, "whop"),
        eq(paymentsTable.status, "under_review"),
      ),
    )
    .limit(100);
  if (!pending.length) return;

  const paymentsPayload = await whopRequest<{ data?: WhopPayment[] }>(
    `/api/v1/payments?account_id=${encodeURIComponent(whopCompanyId())}&first=100`,
  );
  const candidates = Array.isArray(paymentsPayload.data)
    ? paymentsPayload.data
    : [];

  for (const row of pending) {
    const checkoutId = row.payment.evidenceReference;
    if (!checkoutId) continue;
    const candidate = candidates.find((item) => {
      const metadata = item.metadata ?? {};
      const candidateCheckoutId =
        item.checkout_configuration_id ??
        item.checkout_id ??
        (typeof metadata.checkout_id === "string"
          ? metadata.checkout_id
          : null);
      const planId = item.membership?.plan?.id ?? item.plan?.id ?? null;
      const status = String(item.status ?? "").toLowerCase();
      const amount = whopMoneyMajor(item.amount ?? item.total);
      const currency = String(item.currency ?? "").toUpperCase();
      const createdAt = item.created_at
        ? new Date(item.created_at).getTime()
        : NaN;
      return (
        (candidateCheckoutId === checkoutId ||
          (planId === whopPlanId() &&
            Number.isFinite(createdAt) &&
            createdAt >= row.payment.createdAt.getTime())) &&
        ["succeeded", "paid", "completed", "captured", "active"].includes(
          status,
        ) &&
        Number.isFinite(amount) &&
        Math.abs(amount - Number(row.payment.amount)) < 0.01 &&
        (!currency || currency === row.payment.currency)
      );
    });
    const failed = candidates.find((item) => {
      const metadata = item.metadata ?? {};
      const candidateCheckoutId =
        item.checkout_configuration_id ??
        item.checkout_id ??
        (typeof metadata.checkout_id === "string"
          ? metadata.checkout_id
          : null);
      return (
        candidateCheckoutId === checkoutId &&
        ["failed", "declined", "canceled", "cancelled"].includes(
          String(item.status ?? "").toLowerCase(),
        )
      );
    });

    if (failed) {
      await db
        .update(paymentsTable)
        .set({
          status: "failed",
          reviewNote: "Whop reported that the subscription payment failed",
          reviewedBy: "whop-reconciliation",
          reviewedAt: new Date(),
        })
        .where(
          and(
            eq(paymentsTable.id, row.payment.id),
            eq(paymentsTable.status, "under_review"),
          ),
        );
      continue;
    }
    if (!candidate) continue;

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from ${paymentsTable} where id=${row.payment.id} for update`,
      );
      await tx.execute(
        sql`select id from ${subscriptionsTable} where id=${row.subscription.id} for update`,
      );
      const currentPayment = (
        await tx
          .select()
          .from(paymentsTable)
          .where(eq(paymentsTable.id, row.payment.id))
          .limit(1)
      )[0];
      const currentSubscription = (
        await tx
          .select()
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.id, row.subscription.id))
          .limit(1)
      )[0];
      if (!currentPayment || !currentSubscription) return;
      if (currentPayment.status === "confirmed") return;
      const remaining = Math.max(
        0,
        Number(currentSubscription.amountDue) -
          Number(currentSubscription.amountPaid),
      );
      if (remaining === 0) {
        await tx
          .update(paymentsTable)
          .set({
            status: "confirmed",
            reviewNote: "Whop payment matched after the subscription was already settled",
            reviewedBy: "whop-reconciliation",
            reviewedAt: new Date(),
          })
          .where(eq(paymentsTable.id, currentPayment.id));
        return;
      }
      if (Math.abs(remaining - Number(currentPayment.amount)) >= 0.01) {
        throw new Error("Whop subscription payment no longer matches the amount due");
      }
      const [updatedSubscription] = await tx
        .update(subscriptionsTable)
        .set({
          amountPaid: (Number(currentSubscription.amountPaid) + remaining).toFixed(2),
          paymentMethod: "whop",
          status: "active",
        })
        .where(
          and(
            eq(subscriptionsTable.id, currentSubscription.id),
            eq(subscriptionsTable.amountPaid, currentSubscription.amountPaid),
          ),
        )
        .returning();
      if (!updatedSubscription) {
        throw new Error("Subscription changed while Whop payment was processing");
      }
      await tx
        .update(paymentsTable)
        .set({
          status: "confirmed",
          reviewNote: "Verified from Whop payment records",
          reviewedBy: "whop-reconciliation",
          reviewedAt: new Date(),
        })
        .where(
          and(
            eq(paymentsTable.id, currentPayment.id),
            eq(paymentsTable.status, "under_review"),
          ),
        );
      if (row.merchant.status !== "banned") {
        await tx
          .update(merchantsTable)
          .set({ status: "active" })
          .where(eq(merchantsTable.id, row.merchant.id));
      }
      await tx.insert(activityTable).values({
        merchantId: row.merchant.id,
        type: "whop_payment_verified",
        title: "Whop subscription payment verified",
        description:
          "Whop payment evidence was verified server-side and applied to the subscription.",
        amount: remaining.toFixed(2),
        currency: currentSubscription.currency,
        tone: "positive",
      });
    });
  }
}

export function startWhopPolling(port: number): () => void {
  const baseUrl = `http://127.0.0.1:${port}`;
  const intervalMs = 60_000;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await pollWhopCheckouts(baseUrl);
      if (isCustomerWhopConfigured()) {
        await pollWhopSubscriptionPayments();
      }
    } catch (error) {
      console.warn(
        "Whop polling cycle failed",
        error instanceof Error ? error.message : error,
      );
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}