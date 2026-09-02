import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_HTML_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;

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
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

async function assertPublicUrl(value: string): Promise<URL> {
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
  const addresses = isIP(hostname)
    ? [hostname]
    : (await lookup(hostname, { all: true, verbatim: true })).map(
        (entry) => entry.address,
      );
  if (!addresses.length || addresses.some(blockedAddress)) {
    throw new Error("Private and internal supplier addresses are not allowed");
  }
  return url;
}

async function readLimitedBody(response: Response): Promise<string> {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("Supplier page is too large to import safely");
    }
    chunks.push(next.value);
  }
  return new TextDecoder().decode(
    chunks.reduce((all, chunk) => {
      const combined = new Uint8Array(all.length + chunk.length);
      combined.set(all);
      combined.set(chunk, all.length);
      return combined;
    }, new Uint8Array()),
  );
}

async function fetchPublicPage(initialUrl: string): Promise<{ url: URL; html: string }> {
  let url = await assertPublicUrl(initialUrl);
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "TS-Commerce-Product-Importer/1.0",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || attempt === MAX_REDIRECTS) {
        throw new Error("Supplier page redirected too many times");
      }
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) {
      throw new Error(`Supplier page could not be read (HTTP ${response.status})`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new Error("Supplier link must point to a public HTML product page");
    }
    return { url, html: await readLimitedBody(response) };
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
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())) {
    return Number(value);
  }
  return null;
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
  const parsedPrice = rawPrice && /^\d+(?:\.\d{1,2})?$/.test(rawPrice) ? Number(rawPrice).toFixed(2) : null;
  const rawSalePrice =
    meta(html, "product:sale_price:amount") ??
    textValue(offer.salePrice) ??
    (textValue(offer.lowPrice) && textValue(offer.price) !== textValue(offer.lowPrice)
      ? textValue(offer.lowPrice)
      : null);
  const parsedSalePrice =
    rawSalePrice && /^\d+(?:\.\d{1,2})?$/.test(rawSalePrice)
      ? Number(rawSalePrice).toFixed(2)
      : null;
  const currency =
    textValue(offer.priceCurrency) ??
    meta(html, "product:price:currency") ??
    meta(html, "og:price:currency") ??
    "USD";
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
    currency: currency.toUpperCase().slice(0, 3),
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