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
  refund_status?: string;
  dispute_status?: string;
};

export type FlutterwaveVirtualAccountDestination = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  amount: number;
  currency: string;
  providerReference: string | null;
  expiresAt: Date | null;
  raw: Record<string, unknown>;
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

export function flutterwaveCredentialMode(): "live" | "test" | "unknown" {
  const key = process.env.FLUTTERWAVE_SECRET_KEY?.trim() ?? "";
  if (key.startsWith("FLWSECK_TEST-")) return "test";
  if (key.startsWith("FLWSECK-")) return "live";
  return "unknown";
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

function recordValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return undefined;
}

function nestedAccountRecord(data: Record<string, unknown>): Record<string, unknown> {
  for (const key of ["virtual_account", "virtualAccount", "account", "account_details"]) {
    const value = data[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return data;
}

function parseProviderExpiry(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const date = typeof value === "number"
    ? new Date(value > 10_000_000_000 ? value : value * 1000)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Requests a short-lived Flutterwave virtual account for one payment session.
 * The provider response is intentionally parsed defensively because Flutterwave
 * has returned both flat and nested account payloads across rails.
 */
export async function initializeFlutterwaveVirtualAccount(input: {
  txRef: string;
  amount: number;
  currency: string;
  customer: FlutterwaveCustomer;
  narration: string;
  meta: Record<string, string | number>;
}): Promise<FlutterwaveVirtualAccountDestination> {
  const [firstName, ...rest] = (input.customer.name ?? "TS Commerce Customer").trim().split(/\s+/);
  const response = await flutterwaveRequest<FlutterwaveResponse<Record<string, unknown>>>(
    "/virtual-account-numbers",
    {
      method: "POST",
      idempotencyKey: input.txRef,
      body: {
        email: input.customer.email,
        tx_ref: input.txRef,
        amount: Number(input.amount.toFixed(2)),
        currency: input.currency.toUpperCase(),
        firstname: firstName || "TS",
        lastname: rest.join(" ") || "Customer",
        phonenumber: input.customer.phonenumber,
        narration: input.narration.slice(0, 120),
        is_permanent: false,
        duration: 30,
        meta: input.meta,
      },
    },
  );
  const data = response.data;
  if (!data || typeof data !== "object") {
    throw new Error("Flutterwave returned no virtual-account details");
  }
  const account = nestedAccountRecord(data);
  const bankName = String(recordValue(account, ["bank_name", "bankName", "bank"]) ?? "").trim();
  const accountName = String(recordValue(account, ["account_name", "accountName", "name"]) ?? "").trim();
  const accountNumber = String(
    recordValue(account, ["account_number", "accountNumber", "virtual_account_number", "virtualAccountNumber"]) ?? "",
  ).trim();
  if (!bankName || !accountName || !accountNumber) {
    throw new Error("Flutterwave did not return a complete virtual-account destination");
  }
  const amount = Number(recordValue(account, ["amount", "expected_amount", "expectedAmount"]) ?? input.amount);
  const currency = String(recordValue(account, ["currency"]) ?? input.currency).toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0 || currency !== input.currency.toUpperCase()) {
    throw new Error("Flutterwave returned an invalid virtual-account amount or currency");
  }
  const providerReference = recordValue(account, ["id", "reference", "account_id", "accountId", "tx_ref"]);
  const expiresAt = parseProviderExpiry(
    recordValue(account, ["expires_at", "expiresAt", "expiry", "expiration", "expires_on"]),
  ) ?? new Date(Date.now() + 30 * 60 * 1000);
  return {
    bankName,
    accountName,
    accountNumber,
    amount,
    currency,
    providerReference: providerReference == null ? null : String(providerReference),
    expiresAt,
    raw: data,
  };
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