import { createHmac, timingSafeEqual } from "node:crypto";
import { cachedFlutterwaveSecretKey, getStoredFlutterwaveCredentials } from "./flutterwave-runtime";

const FLUTTERWAVE_API = "https://api.flutterwave.com/v3";

export type FlutterwaveCustomer = {
  email: string;
  name?: string;
  phonenumber?: string;
  country?: string;
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

class FlutterwaveRequestError extends Error {
  readonly statusCode: number;
  readonly providerMessage: string;

  constructor(statusCode: number, providerMessage: string) {
    super(`Flutterwave ${statusCode}: ${providerMessage}`);
    this.name = "FlutterwaveRequestError";
    this.statusCode = statusCode;
    this.providerMessage = providerMessage;
  }
}

function envValue(primary: string, legacy: string): string {
  return process.env[primary]?.trim() || process.env[legacy]?.trim() || "";
}

async function secretKey(override?: string): Promise<string> {
  const value = override?.trim() || (await getStoredFlutterwaveCredentials()).secretKey;
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
  options: { method?: string; body?: Record<string, unknown>; idempotencyKey?: string; secretKeyOverride?: string } = {},
): Promise<T> {
  const response = await fetch(`${FLUTTERWAVE_API}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${await secretKey(options.secretKeyOverride)}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.idempotencyKey ? { "X-Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new FlutterwaveRequestError(response.status, providerError(payload));
  }
  return payload as T;
}

export const FLUTTERWAVE_PAYMENT_METHODS_BY_CURRENCY: Record<string, readonly string[]> = {
  NGN: ["card","account","banktransfer","ussd","nqr","opay"],
  GHS: ["card","mobilemoneyghana"],
  KES: ["card","mpesa"],
  ZAR: ["card","account"],
  GBP: ["card","account"],
  EUR: ["card","account"],
  USD: ["card","account"],
} as const;

export function flutterwavePaymentOptionsForCurrency(currency: string): string {
  const code = currency.trim().toUpperCase();
  return [...(FLUTTERWAVE_PAYMENT_METHODS_BY_CURRENCY[code] ?? ["card"])].join(",");
}

export const FLUTTERWAVE_DIRECT_BANK_TRANSFER_CURRENCIES = ["NGN", "GHS"] as const;

/** Initial external payout rail: Nigerian bank accounts. */
export const FLUTTERWAVE_PAYOUT_CURRENCIES = ["NGN"] as const;
export function supportsFlutterwavePayoutCurrency(currency: string): boolean {
  return FLUTTERWAVE_PAYOUT_CURRENCIES.includes(currency.trim().toUpperCase() as (typeof FLUTTERWAVE_PAYOUT_CURRENCIES)[number]);
}

export function supportsFlutterwaveDirectBankTransfer(currency: string): boolean {
  return FLUTTERWAVE_DIRECT_BANK_TRANSFER_CURRENCIES.includes(
    currency.trim().toUpperCase() as (typeof FLUTTERWAVE_DIRECT_BANK_TRANSFER_CURRENCIES)[number],
  );
}

export function isFlutterwaveConfigured(): boolean {
  const env = envValue("FLUTTERWAVE_SECRET_KEY", "FLW_SECRET_KEY");
  return Boolean(env || cachedFlutterwaveSecretKey());
}

export function flutterwaveCredentialMode(): "live" | "test" | "unknown" {
  const key = envValue("FLUTTERWAVE_SECRET_KEY", "FLW_SECRET_KEY") || cachedFlutterwaveSecretKey() || "";
  if (key.startsWith("FLWSECK_TEST-")) return "test";
  if (key.startsWith("FLWSECK-")) return "live";
  return "unknown";
}

export async function checkFlutterwaveConnection(secretOverride?: string): Promise<{ status: string }> {
  const response = await flutterwaveRequest<FlutterwaveResponse<unknown>>("/transactions?limit=1", {
    secretKeyOverride: secretOverride,
  });
  return { status: String(response.status ?? "ok") };
}

export function flutterwaveTransactionId(value: FlutterwaveTransaction): string | null {
  if (value.id === undefined || value.id === null) return null;
  return String(value.id);
}

export function flutterwaveStatus(value: FlutterwaveTransaction): "paid" | "failed" | "pending" {
  const status = String(value.status ?? "").toLowerCase();
  if (["successful", "success", "completed", "paid", "succeeded"].includes(status)) return "paid";
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
  paymentOptions?: string;
}): Promise<{ link: string; txRef: string }> {
  const supported = new Set(FLUTTERWAVE_PAYMENT_METHODS_BY_CURRENCY[input.currency.trim().toUpperCase()] ?? ["card"]);
  const requested = input.paymentOptions?.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean) ?? [];
  const paymentOptions = input.paymentOptions == null
    ? [...supported].join(",")
    : [...new Set(requested.filter((value) => supported.has(value)))].join(",");
  if (!paymentOptions) {
    throw new Error("The selected Flutterwave payment methods are not available for this transaction currency");
  }

  const response = await flutterwaveRequest<FlutterwaveResponse<{ link?: string }>>("/payments", {
    method: "POST",
    idempotencyKey: input.txRef,
    body: {
      tx_ref: input.txRef,
      amount: Number(input.amount.toFixed(2)),
      currency: input.currency.toUpperCase(),
      redirect_url: input.redirectUrl,
       payment_options: input.paymentOptions ?? flutterwavePaymentOptionsForCurrency(input.currency),
      customer: input.customer,
      customizations: { title: input.title.slice(0, 120), description: "Secure payment powered by Lunavo" },
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
  const [firstName, ...rest] = (input.customer.name ?? "Lunavo Customer").trim().split(/\s+/);
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
        // Dynamic virtual-account expiry is specified in seconds. Keep the
        // configured provider window explicit and show the provider-returned
        // expiry to the customer when it is supplied.
        expires: 1800,
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
    recordValue(account, ["expires_at", "expiresAt", "expiry", "expiration", "expires_on", "expiry_date"]),
  );
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

export async function findFlutterwaveTransactionsByReference(
  txRef: string,
  from: string,
  to: string,
): Promise<FlutterwaveTransaction[]> {
  const params = new URLSearchParams({
    tx_ref: txRef,
    from,
    to,
    page: "1",
  });
  const response = await flutterwaveRequest<FlutterwaveResponse<FlutterwaveTransaction[]>>(
    `/transactions?${params.toString()}`,
  );
  return Array.isArray(response.data) ? response.data : [];
}

export async function verifyFlutterwaveTransaction(transactionId: string): Promise<FlutterwaveTransaction> {
  const response = await flutterwaveRequest<FlutterwaveResponse<FlutterwaveTransaction>>(
    `/transactions/${encodeURIComponent(transactionId)}/verify`,
  );
  if (!response.data) throw new Error("Flutterwave returned no transaction details");
  return response.data;
}

export type FlutterwaveTransfer = {
  id?: number | string;
  reference?: string;
  status?: string;
  amount?: number | string;
  currency?: string;
  debit_currency?: string | null;
  fee?: number | string;
  account_number?: string;
  bank_code?: string;
  bank_name?: string;
  full_name?: string;
  complete_message?: string;
};

export function flutterwaveTransferStatus(value: FlutterwaveTransfer): "paid" | "failed" | "pending" {
  const status = String(value.status ?? "").toUpperCase();
  if (["SUCCESSFUL", "SUCCESS", "COMPLETED"].includes(status)) return "paid";
  if (["FAILED", "CANCELLED", "CANCELED", "REVERSED", "DECLINED"].includes(status)) return "failed";
  return "pending";
}

export async function createFlutterwaveTransfer(input: {
  reference: string;
  amount: number;
  currency: string;
  bankCode: string;
  accountNumber: string;
  beneficiaryName: string;
  narration: string;
}): Promise<FlutterwaveTransfer> {
  const currency = input.currency.trim().toUpperCase();
  if (!supportsFlutterwavePayoutCurrency(currency)) {
    throw new Error(`Flutterwave payout rail is not enabled for ${currency}`);
  }
  const response = await flutterwaveRequest<FlutterwaveResponse<FlutterwaveTransfer>>("/transfers", {
    method: "POST",
    idempotencyKey: input.reference,
    body: {
      account_bank: input.bankCode.trim(),
      account_number: input.accountNumber.trim(),
      amount: Number(input.amount.toFixed(2)),
      currency,
      beneficiary_name: input.beneficiaryName.trim(),
      narration: input.narration.slice(0, 120),
      reference: input.reference,
    },
  });
  if (!response.data) throw new Error("Flutterwave returned no transfer details");
  return response.data;
}

export async function verifyFlutterwaveTransfer(transferId: string): Promise<FlutterwaveTransfer> {
  const response = await flutterwaveRequest<FlutterwaveResponse<FlutterwaveTransfer>>(
    `/transfers/${encodeURIComponent(transferId)}`,
  );
  if (!response.data) throw new Error("Flutterwave returned no transfer details");
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

export async function verifyFlutterwaveWebhookSignatureAsync(
  rawBody: Buffer,
  currentSignature: string | undefined,
  legacySignature?: string,
): Promise<boolean> {
  const secrets = await getStoredFlutterwaveCredentials();
  const secret = secrets.webhookSecret;
  if (!secret) return false;

  if (currentSignature?.trim()) {
    const supplied = Buffer.from(currentSignature.trim());
    const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("base64"));
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  if (legacySignature?.trim()) {
    const supplied = Buffer.from(legacySignature.trim());
    const expected = Buffer.from(secret);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }
  return false;
}

export function verifyFlutterwaveWebhookSignature(
  rawBody: Buffer,
  currentSignature: string | undefined,
  legacySignature?: string,
): boolean {
  const secret = envValue("FLUTTERWAVE_WEBHOOK_SECRET", "FLW_WEBHOOK_HASH");
  if (!secret) return false;

  // Current Flutterwave webhook signing: HMAC-SHA256 over the exact raw body,
  // represented as base64 in the flutterwave-signature header.
  if (currentSignature?.trim()) {
    const supplied = Buffer.from(currentSignature.trim());
    const expected = Buffer.from(
      createHmac("sha256", secret).update(rawBody).digest("base64"),
    );
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  // Legacy Flutterwave verif-hash mode: compare the provider-supplied value
  // against the configured secret. Never treat the received signature itself
  // as a secret.
  if (legacySignature?.trim()) {
    const supplied = Buffer.from(legacySignature.trim());
    const expected = Buffer.from(secret);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  return false;
}