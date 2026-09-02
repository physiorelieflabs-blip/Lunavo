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
  price: string | null;
  currency: string;
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

export async function importPublicSupplierProduct(sourceUrl: string): Promise<ImportedSupplierProduct> {
  const { url, html } = await fetchPublicPage(sourceUrl);
  const product = jsonLdProduct(html);
  const offer =
    product?.offers && typeof product.offers === "object"
      ? (product.offers as Record<string, unknown>)
      : {};
  const rawPrice =
    textValue(offer.price) ??
    meta(html, "product:price:amount") ??
    meta(html, "og:price:amount");
  const parsedPrice = rawPrice && /^\d+(?:\.\d{1,2})?$/.test(rawPrice) ? Number(rawPrice).toFixed(2) : null;
  const currency =
    textValue(offer.priceCurrency) ??
    meta(html, "product:price:currency") ??
    meta(html, "og:price:currency") ??
    "USD";
  const image = textValue(product?.image) ?? meta(html, "og:image");
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
    imageUrl: image && /^https?:\/\//i.test(image) ? image : null,
    price: parsedPrice,
    currency: currency.toUpperCase().slice(0, 3),
  };
}