import { createHash, randomBytes } from "node:crypto";

export type IssuedSupplierQuotePortalToken = {
  token: string;
  tokenHash: string;
};

/** A high-entropy, URL-safe bearer token. Callers must never persist the raw token. */
export function issueSupplierQuotePortalToken(): IssuedSupplierQuotePortalToken {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: createHash("sha256").update(token).digest("hex") };
}

/** Accept only the exact URL-safe shape produced by issueSupplierQuotePortalToken. */
export function hashSupplierQuotePortalToken(value: unknown): string | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Share links must be built from trusted deployment configuration, never Host or
 * Origin headers that an unauthenticated caller can forge.
 */
export function resolveSupplierQuotePortalBaseUrl(
  raw = process.env.APP_BASE_URL,
  nodeEnv = process.env.NODE_ENV,
): URL {
  if (!raw?.trim()) throw new Error("APP_BASE_URL must be configured before issuing supplier quote links");
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("APP_BASE_URL must be a valid absolute URL");
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error("APP_BASE_URL must be an HTTP(S) URL without credentials, query parameters, or fragments");
  }
  if (nodeEnv === "production" && url.protocol !== "https:") {
    throw new Error("APP_BASE_URL must use HTTPS in production");
  }
  return url;
}

export function supplierQuotePortalUrl(baseUrl: URL, token: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Invalid supplier quote portal token shape");
  // Preserve an optional deployment path prefix from APP_BASE_URL. Starting with
  // "/supplier-quote" would discard that prefix and produce broken share links
  // for intentionally subpath-mounted self-hosted installations.
  const basePath = baseUrl.pathname.replace(/\\/+$/, "");
  const path = basePath + "/supplier-quote/" + token;
  return new URL(path, baseUrl.origin).toString();
}

export const SUPPLIER_QUOTE_PORTAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
