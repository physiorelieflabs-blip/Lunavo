import { createHmac, timingSafeEqual } from "node:crypto";

const FLUTTERWAVE_API = "https://api.flutterwave.com/v3";

export type FlutterwaveCustomer = {
  email: string;
  name?: string;
  phonenumber?: string;
};

export type FlutterwaveTransaction = {
  id?: number | string;
  tx_ref?: string;
  status?: string;
  amount?: number | string;
  charged_amount?: number | string;
  currency?: string;
  app_fee?: number | string;
  customer?: FlutterwaveCustomer;
  meta?: Record<string, unknown>;
};

type FlutterwaveResponse<T> = {
  status?: string;
  message?: string;
  data?: T;
};

function secretKey(): string {
  const value = process.env.FLUTTERWAVE_SECRET_KEY?.trim();
  if (!value) throw new Error("Flutterwave online payments are not configured");
  return value;
}

function providerError(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "Flutterwave did not accept the request";
}

async function flutterwaveRequest<T>(
  path: string,
  options: { method?: string; body?: Record<string, unknown>; idempotencyKey?: string } = {},
): Promise<T> {
  const response = await fetch(`${FLUTTERWAVE_API}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${secretKey()}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.idempotencyKey ? { "X-Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) throw new Error(providerError(payload));
  return payload as T;
}

export function isFlutterwaveConfigured(): boolean {
  return Boolean(process.env.FLUTTERWAVE_SECRET_KEY?.trim());
}

export async function checkFlutterwaveConnection(): Promise<{ status: string }> {
  const response = await flutterwaveRequest<FlutterwaveResponse<unknown>>("/transactions?limit=1");
  return { status: String(response.status ?? "ok") };
}

export function flutterwaveTransactionId(value: FlutterwaveTransaction): string | null {
  if (value.id === undefined || value.id === null) return null;
  return String(value.id);
}

export function flutterwaveStatus(value: FlutterwaveTransaction): "paid" | "failed" | "pending" {
  const status = String(value.status ?? "").toLowerCase();
  if (["successful", "success", "completed", "paid"].includes(status)) return "paid";
  if (["failed", "cancelled", "canceled", "reversed", "declined"].includes(status)) return "failed";
  return "pending";
}

export function flutterwaveAmount(value: FlutterwaveTransaction): number {
  return Number(value.amount ?? value.charged_amount ?? NaN);
}

export async function initializeFlutterwavePayment(input: {
  txRef: string;
  amount: number;
  currency: string;
  redirectUrl: string;
  customer: FlutterwaveCustomer;
  title: string;
  meta: Record<string, string | number>;
}): Promise<{ link: string; txRef: string }> {
  const response = await flutterwaveRequest<FlutterwaveResponse<{ link?: string }>>("/payments", {
    method: "POST",
    idempotencyKey: input.txRef,
    body: {
      tx_ref: input.txRef,
      amount: Number(input.amount.toFixed(2)),
      currency: input.currency.toUpperCase(),
      redirect_url: input.redirectUrl,
      payment_options: "card,banktransfer,ussd,mobilemoney",
      customer: input.customer,
      customizations: { title: input.title.slice(0, 120), description: "Secure payment powered by TS Commerce" },
      meta: input.meta,
    },
  });
  const link = response.data?.link;
  if (!link) throw new Error("Flutterwave returned an incomplete hosted checkout");
  return { link, txRef: input.txRef };
}

export async function verifyFlutterwaveTransaction(transactionId: string): Promise<FlutterwaveTransaction> {
  const response = await flutterwaveRequest<FlutterwaveResponse<FlutterwaveTransaction>>(
    `/transactions/${encodeURIComponent(transactionId)}/verify`,
  );
  if (!response.data) throw new Error("Flutterwave returned no transaction details");
  return response.data;
}

export async function refundFlutterwaveTransaction(
  transactionId: string,
  amount: number,
  idempotencyKey: string,
): Promise<{ id: string | null; status: string }> {
  const response = await flutterwaveRequest<FlutterwaveResponse<{ id?: number | string; status?: string }>>(
    `/transactions/${encodeURIComponent(transactionId)}/refund`,
    { method: "POST", idempotencyKey, body: { amount: Number(amount.toFixed(2)) } },
  );
  return { id: response.data?.id == null ? null : String(response.data.id), status: String(response.data?.status ?? response.status ?? "pending") };
}

export function verifyFlutterwaveWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.FLUTTERWAVE_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;
  const supplied = Buffer.from(signature.trim());
  const direct = Buffer.from(secret);
  if (supplied.length === direct.length && timingSafeEqual(supplied, direct)) return true;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const hmac = Buffer.from(expected);
  return supplied.length === hmac.length && timingSafeEqual(supplied, hmac);
}