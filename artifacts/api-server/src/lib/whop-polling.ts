import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  invoicesTable,
  ordersTable,
  paymentIntentsTable,
} from "@workspace/db";
import { isCustomerWhopConfigured } from "./whop-client";

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

export function startWhopPolling(port: number): () => void {
  const baseUrl = `http://127.0.0.1:${port}`;
  const intervalMs = 60_000;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await pollWhopCheckouts(baseUrl);
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