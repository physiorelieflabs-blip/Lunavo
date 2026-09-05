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

function blockedAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    return blockedAddress(normalized.slice("::ffff:".length));
  }
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

async function resolvePublicAddress(hostname: string): Promise<string> {
  const resolution = isIP(hostname)
    ? Promise.resolve([hostname])
    : lookup(hostname, { all: true, verbatim: true }).then((entries) =>
        entries.map((entry) => entry.address),
      );
  const addresses = await Promise.race([
    resolution,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Supplier DNS lookup timed out")), DNS_LOOKUP_TIMEOUT_MS),
    ),
  ]);
  if (!addresses.length || addresses.some(blockedAddress)) {
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
    const contentType = response.contentType;
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new Error("Supplier link must point to a public HTML product page");
    }
    return { url, html: response.html };
  }
  throw new Error("Supplier page could not be read");
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