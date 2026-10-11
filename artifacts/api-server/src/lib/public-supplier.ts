import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

const MAX_HTML_BYTES = 1_000_000;
const MAX_IMPORTED_NUMBER = 100_000_000;
const DNS_LOOKUP_TIMEOUT_MS = 3_000;
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 2 * 60 * 1000;
const MIN_HOST_REQUEST_GAP_MS = 250;
export const SUPPORTED_SUPPLIER_CURRENCIES = [
  "USD",
  "NGN",
  "GHS",
  "KES",
  "ZAR",
  "GBP",
  "EUR",
  "CAD",
  "AUD",
] as const;
const pageCache = new Map<string, { expiresAt: number; value: { url: URL; html: string } }>();
const inFlightPages = new Map<string, Promise<{ url: URL; html: string }>>();
const lastHostRequest = new Map<string, number>();

export type ImportedSupplierProduct = {
  sourceUrl: string;
  sourceDomain: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  videoUrls: string[];
  price: string | null;
  salePrice: string | null;
  currency: string;
  sku: string | null;
  sourceProductId: string | null;
  variants: Array<Record<string, unknown>>;
  attributes: Record<string, string>;
  availability: string | null;
  availabilityQuantity: number | null;
  category: string | null;
  specifications: Record<string, string>;
  brand: string | null;
  shippingInformation: Record<string, unknown> | null;
  sourceMetadata: Record<string, unknown>;
};

/** Fail closed for special-use, private, malformed, and ambiguous address literals. */
export function isBlockedSupplierAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%", 1)[0] ?? "";
  const version = isIP(normalized);
  if (version === 4) {
    const octets = normalized.split(".").map(Number);
    const [a, b, c] = octets;
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (version !== 6) return true;
  // Reject mapped/compatible forms to avoid disagreements between URL, DNS and socket parsers.
  if (normalized.startsWith("::")) return true;
  if (/^f[cd]/i.test(normalized)) return true;
  if (/^fe[89ab]/i.test(normalized)) return true;
  if (/^ff/i.test(normalized)) return true;
  if (normalized.startsWith("2001:")) {
    const secondHextet = Number.parseInt(normalized.split(":")[1] ?? "", 16);
    if (secondHextet === 0 || secondHextet === 2 || secondHextet === 0xdb8 || (secondHextet >= 0x10 && secondHextet <= 0x2f)) return true;
  }
  const firstHextet = Number.parseInt(normalized.split(":")[0] ?? "", 16);
  // Only global-unicast 2000::/3 is eligible for public supplier fetching.
  return !Number.isFinite(firstHextet) || firstHextet < 0x2000 || firstHextet > 0x3fff;
}

async function resolvePublicAddress(hostname: string): Promise<string> {
  const resolution = isIP(hostname)
    ? Promise.resolve([hostname])
    : lookup(hostname, { all: true, verbatim: true }).then((entries) =>
        entries.map((entry) => entry.address),
      );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let addresses: string[];
  try {
    addresses = await Promise.race([
      resolution,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Supplier DNS lookup timed out")), DNS_LOOKUP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  if (!addresses.length || addresses.some(isBlockedSupplierAddress)) {
    throw new Error("Private and internal supplier addresses are not allowed");
  }
  return addresses[0]!;
}

async function assertPublicUrl(value: string): Promise<{ url: URL; address: string }> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid public http or https supplier URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only public http and https supplier URLs are supported");
  }
  const hostname = url.hostname.toLowerCase();
  if (url.username || url.password) {
    throw new Error("Supplier URLs must not contain embedded credentials");
  }
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal"
  ) {
    throw new Error("Private and internal supplier addresses are not allowed");
  }
  return { url, address: await resolvePublicAddress(hostname) };
}

function headerValue(headers: Record<string, string | string[] | undefined>, key: string): string | null {
  const value = headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

async function requestPinnedPage(
  url: URL,
  address: string,
): Promise<{ statusCode: number; location: string | null; contentType: string; html: string }> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)({
      hostname: address,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      servername: isIP(url.hostname) ? undefined : url.hostname,
      rejectUnauthorized: true,
      headers: {
        accept: "text/html,application/xhtml+xml",
        host: url.host,
        "user-agent": "TS-Commerce-Product-Importer/1.0",
      },
      timeout: 8_000,
    }, (response) => {
  const chunks: Uint8Array[] = [];
  let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_HTML_BYTES) {
          request.destroy(new Error("Supplier page is too large to import safely"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        statusCode: response.statusCode ?? 0,
        location: headerValue(response.headers, "location"),
        contentType: headerValue(response.headers, "content-type") ?? "",
        html: Buffer.concat(chunks).toString("utf8"),
      }));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("Supplier page request timed out")));
    request.on("error", reject);
    request.end();
  });
}

async function fetchPublicPage(initialUrl: string): Promise<{ url: URL; html: string }> {
  const resolved = await assertPublicUrl(initialUrl);
  let url = resolved.url;
  const cacheKey = url.toString();
  const cached = pageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = inFlightPages.get(cacheKey);
  if (pending) return pending;
  const request = fetchPublicPageUncached(url, resolved.address);
  inFlightPages.set(cacheKey, request);
  try {
    const value = await request;
    pageCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  } finally {
    inFlightPages.delete(cacheKey);
  }
}

async function fetchPublicPageUncached(initialUrl: URL, initialAddress: string): Promise<{ url: URL; html: string }> {
  let url = initialUrl;
  let address = initialAddress;
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const previousRequest = lastHostRequest.get(url.hostname) ?? 0;
    const waitMs = MIN_HOST_REQUEST_GAP_MS - (Date.now() - previousRequest);
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastHostRequest.set(url.hostname, Date.now());
    const response = await requestPinnedPage(url, address);
    if (response.statusCode >= 300 && response.statusCode < 400) {
      const location = response.location;
      if (!location || attempt === MAX_REDIRECTS) {
        throw new Error("Supplier page redirected too many times");
      }
      const next = await assertPublicUrl(new URL(location, url).toString());
      url = next.url;
      address = next.address;
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Supplier page could not be read (HTTP ${response.statusCode})`);
    }
    const contentType = response.contentType.toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new Error("Supplier link must point to a public HTML product page");
    }
    return { url, html: response.html };
  }
  throw new Error("Supplier page could not be read");
}


// Only passive raster formats are forwarded to a self-hosted vision server. SVG/HTML are intentionally excluded.
const SAFE_RASTER_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function isSafeRasterImageType(contentType: string): boolean {
  return SAFE_RASTER_IMAGE_TYPES.has(contentType.split(";", 1)[0]!.trim().toLowerCase());
}

export function matchesRasterImageSignature(contentType: string, body: Buffer): boolean {
  const type = contentType.split(";", 1)[0]!.trim().toLowerCase();
  if (type === "image/jpeg") return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (type === "image/png") return body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (type === "image/webp") return body.length >= 12 && body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP";
  if (type === "image/gif") return body.length >= 6 && ["GIF87a", "GIF89a"].includes(body.toString("ascii", 0, 6));
  if (type === "image/avif") return body.length >= 12 && body.toString("ascii", 4, 8) === "ftyp" && /^(avif|avis)$/.test(body.toString("ascii", 8, 12));
  return false;
}

async function requestPinnedImage(
  url: URL,
  address: string,
): Promise<{ statusCode: number; location: string | null; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finishError = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)({
      hostname: address,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      servername: isIP(url.hostname) ? undefined : url.hostname,
      rejectUnauthorized: true,
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9",
        host: url.host,
        "user-agent": "Lunavo-Self-Hosted-Vision/1.0",
      },
      timeout: 8_000,
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        if (settled) return;
        size += chunk.length;
        if (size > MAX_IMAGE_BYTES) {
          request.destroy(new Error("Supplier image exceeds the safe size limit"));
          finishError(new Error("Supplier image exceeds the safe size limit"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (settled) return;
        settled = true;
        resolve({
          statusCode: response.statusCode ?? 0,
          location: headerValue(response.headers, "location"),
          contentType: headerValue(response.headers, "content-type") ?? "",
          body: Buffer.concat(chunks),
        });
      });
      response.on("error", finishError);
    });
    request.on("timeout", () => request.destroy(new Error("Supplier image request timed out")));
    request.on("error", finishError);
    request.end();
  });
}

/**
 * Securely retrieves an image on the API server, pins DNS to a vetted public address,
 * validates every redirect, and returns raster bytes as a data URL. The local model
 * server therefore never has to dereference an untrusted supplier URL itself.
 */
export async function fetchPublicImageDataUrl(initialUrl: string): Promise<string> {
  const first = await assertPublicUrl(initialUrl);
  let url = first.url;
  let address = first.address;

  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const previousRequest = lastHostRequest.get(url.hostname) ?? 0;
    const waitMs = MIN_HOST_REQUEST_GAP_MS - (Date.now() - previousRequest);
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastHostRequest.set(url.hostname, Date.now());

    const response = await requestPinnedImage(url, address);
    if (response.statusCode >= 300 && response.statusCode < 400) {
      if (!response.location || attempt === MAX_REDIRECTS) {
        throw new Error("Supplier image redirected too many times");
      }
      const next = await assertPublicUrl(new URL(response.location, url).toString());
      url = next.url;
      address = next.address;
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Supplier image could not be read (HTTP ${response.statusCode})`);
    }
    const mimeType = response.contentType.split(";", 1)[0]!.trim().toLowerCase();
    if (!isSafeRasterImageType(mimeType) || !matchesRasterImageSignature(mimeType, response.body)) {
      throw new Error("Supplier image must be a supported raster image with a matching content signature");
    }
    return `data:${mimeType};base64,${response.body.toString("base64")}`;
  }
  throw new Error("Supplier image could not be read");
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return null;
}

function jsonLdProduct(html: string): Record<string, unknown> | null {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const script of scripts) {
    try {
      const parsed: unknown = JSON.parse(script[1].trim());
      const candidates = Array.isArray(parsed)
        ? parsed
        : typeof parsed === "object" && parsed !== null && "@graph" in parsed
          ? (parsed as { "@graph": unknown })["@graph"]
          : [parsed];
      const product = Array.isArray(candidates)
        ? candidates.find(
            (candidate) =>
              typeof candidate === "object" &&
              candidate !== null &&
              ((candidate as { "@type"?: string | string[] })["@type"] === "Product" ||
                (Array.isArray((candidate as { "@type"?: unknown })["@type"]) &&
                  ((candidate as { "@type": string[] })["@type"]).includes("Product"))),
          )
        : null;
      if (product && typeof product === "object") return product as Record<string, unknown>;
    } catch {
      // A page can contain unrelated or invalid JSON-LD; metadata parsing still works.
    }
  }
  return null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? decodeHtml(value).slice(0, 1000) : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_IMPORTED_NUMBER) return value;
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_IMPORTED_NUMBER ? parsed : null;
  }
  return null;
}

function moneyValue(value: unknown): string | null {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_IMPORTED_NUMBER
    ? parsed.toFixed(2)
    : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map((item): string | null => {
      if (typeof item === "string") return item;
      const url = objectValue(item)?.url;
      return typeof url === "string" ? url : null;
    })
    .filter((item): item is string => Boolean(item && /^https?:\/\//i.test(item)))
    .slice(0, 20);
}

function properties(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) return {};
  return Object.fromEntries(
    value
      .map((item) => {
        const record = objectValue(item);
        const name = textValue(record?.name);
        const itemValue = textValue(record?.value);
        return name && itemValue ? [name, itemValue] : null;
      })
      .filter((item): item is [string, string] => Boolean(item)),
  );
}

function normalizeAvailability(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase().split("/").pop() ?? value;
  if (normalized.includes("instock")) return "in_stock";
  if (normalized.includes("outofstock")) return "out_of_stock";
  if (normalized.includes("limited")) return "limited_stock";
  if (normalized.includes("preorder")) return "preorder";
  return normalized.replace(/[^a-z0-9]+/g, "_");
}

function variantRecords(product: Record<string, unknown>): Array<Record<string, unknown>> {
  const variants = Array.isArray(product.hasVariant)
    ? product.hasVariant
    : Array.isArray(product.model) ? product.model : [];
  return variants
    .map((variant) => {
      const record = objectValue(variant);
      if (!record) return null;
      return {
        name: textValue(record.name),
        sku: textValue(record.sku),
        productId: textValue(record.productID),
        imageUrl: stringList(record.image)[0] ?? null,
        color: textValue(record.color),
        size: textValue(record.size),
        material: textValue(record.material),
        price: numberValue(objectValue(record.offers)?.price),
        availability: normalizeAvailability(textValue(objectValue(record.offers)?.availability)),
      };
    })
    .filter((item) => item !== null)
    .map((item) => item as Record<string, unknown>)
    .slice(0, 100);
}

export async function importPublicSupplierProduct(sourceUrl: string): Promise<ImportedSupplierProduct> {
  const { url, html } = await fetchPublicPage(sourceUrl);
  const product = jsonLdProduct(html);
  const offerValue = Array.isArray(product?.offers) ? product?.offers[0] : product?.offers;
  const offer = objectValue(offerValue) ?? {};
  const rawPrice =
    textValue(offer.price) ??
    textValue(offer.lowPrice) ??
    meta(html, "product:price:amount") ??
    meta(html, "og:price:amount");
  const parsedPrice = moneyValue(rawPrice);
  const rawSalePrice =
    meta(html, "product:sale_price:amount") ??
    textValue(offer.salePrice) ??
    (textValue(offer.lowPrice) && textValue(offer.price) !== textValue(offer.lowPrice)
      ? textValue(offer.lowPrice)
      : null);
  const parsedSalePrice = moneyValue(rawSalePrice);
  const currency =
    textValue(offer.priceCurrency) ??
    meta(html, "product:price:currency") ??
    meta(html, "og:price:currency") ??
    "USD";
  const normalizedCurrency = currency.trim().toUpperCase();
  if (!SUPPORTED_SUPPLIER_CURRENCIES.includes(normalizedCurrency as (typeof SUPPORTED_SUPPLIER_CURRENCIES)[number])) {
    throw new Error(`Supplier product currency is not supported (${SUPPORTED_SUPPLIER_CURRENCIES.join(", ")})`);
  }
  const imageUrls = [
    ...stringList(product?.image),
    ...stringList(product?.associatedMedia),
    ...[meta(html, "og:image")].filter((value): value is string => Boolean(value)),
  ].filter((value, index, values) => values.indexOf(value) === index).slice(0, 20);
  const brandValue = objectValue(product?.brand);
  const availability = normalizeAvailability(
    textValue(offer.availability) ?? textValue(product?.availability),
  );
  const availabilityQuantity =
    numberValue(offer.inventoryLevel) ??
    numberValue(product?.inventoryLevel) ??
    null;
  const sku = textValue(product?.sku) ?? textValue(offer.sku);
  const sourceProductId = textValue(product?.productID) ?? textValue(product?.mpn) ?? sku;
  const shippingInformation = objectValue(product?.shippingDetails);
  const videoUrls = stringList(product?.video);
  const variants = product ? variantRecords(product) : [];
  const specifications = properties(product?.additionalProperty);
  const hasUsableProductData = Boolean(
    product ||
      meta(html, "og:title") ||
      meta(html, "product:name") ||
      rawPrice ||
      imageUrls.length,
  );
  if (!hasUsableProductData) {
    throw new Error(
      "This public page did not expose usable product information. Enter the details manually or use a direct product page.",
    );
  }
  const sourceMetadata = {
    structuredData: Boolean(product),
    priceValidUntil: textValue(offer.priceValidUntil),
    productType: product?.["@type"] ?? null,
    category: textValue(product?.category),
    brand: textValue(brandValue?.name) ?? textValue(product?.brand),
  };
  return {
    sourceUrl: url.toString(),
    sourceDomain: url.hostname,
    title:
      textValue(product?.name) ??
      meta(html, "og:title") ??
      meta(html, "twitter:title") ??
      (decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") ||
        url.hostname),
    description: textValue(product?.description) ?? meta(html, "og:description") ?? meta(html, "description"),
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    videoUrls,
    price: parsedPrice,
    salePrice: parsedSalePrice,
    currency: normalizedCurrency,
    sku,
    sourceProductId,
    variants,
    attributes: {
      ...(textValue(product?.color) ? { color: textValue(product?.color)! } : {}),
      ...(textValue(product?.size) ? { size: textValue(product?.size)! } : {}),
      ...(textValue(product?.material) ? { material: textValue(product?.material)! } : {}),
    },
    availability,
    availabilityQuantity,
    category: textValue(product?.category),
    specifications,
    brand: textValue(brandValue?.name) ?? textValue(product?.brand),
    shippingInformation,
    sourceMetadata,
  };
}