import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export type WhopCheckoutConfiguration = {
  id: string;
  purchase_url?: string | null;
  redirect_url?: string | null;
  plan?: {
    id?: string | null;
    plan_type?: string | null;
    currency?: string | null;
    initial_price?: number | null;
    renewal_price?: number | null;
  } | null;
  metadata?: Record<string, unknown> | null;
};

export type WhopPayment = {
  id?: string;
  status?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  created_at?: string | null;
  checkout_configuration_id?: string | null;
  checkout_id?: string | null;
  metadata?: Record<string, unknown> | null;
  membership?: {
    id?: string | null;
    status?: string | null;
    plan?: { id?: string | null } | null;
  } | null;
  plan?: { id?: string | null } | null;
};

export type WhopPlan = {
  id: string;
  plan_type?: string | null;
  currency?: string | null;
  initial_price?: number | null;
  renewal_price?: number | null;
  product?: { id?: string | null } | null;
};

function providerError(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const message = (payload as { error?: { message?: unknown } | unknown }).error;
    if (message && typeof message === "object" && "message" in message) {
      const detail = (message as { message?: unknown }).message;
      if (typeof detail === "string" && detail.trim()) return detail.trim();
    }
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "Whop did not accept the request";
}

export async function whopRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const response = await connectors.proxy("whop", path, {
    method: options.method ?? "GET",
    headers: { Accept: "application/json" },
    body: options.body,
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(providerError(payload));
  }
  return payload as T;
}

export function whopPlanId(): string {
  const value = process.env.WHOP_PLAN_ID?.trim();
  if (!value) throw new Error("Whop is not configured for hosted checkout");
  return value;
}

export function whopCompanyId(): string {
  const value = process.env.WHOP_COMPANY_ID?.trim();
  if (!value) throw new Error("Whop company configuration is missing");
  return value;
}

export function whopCustomerProductId(): string {
  const value = process.env.WHOP_CUSTOMER_PRODUCT_ID?.trim();
  if (!value) throw new Error("Whop customer payment product is not configured");
  return value;
}

export function isWhopConfigured(): boolean {
  return Boolean(process.env.WHOP_COMPANY_ID?.trim() && process.env.WHOP_PLAN_ID?.trim());
}

export function isCustomerWhopConfigured(): boolean {
  return Boolean(
    process.env.WHOP_COMPANY_ID?.trim() &&
      process.env.WHOP_CUSTOMER_PRODUCT_ID?.trim(),
  );
}