import { isIP } from "node:net";
import { validateGeneratedRasterImage } from "./image-safety";
type GeneratedImage = {
  model: string;
  mimeType: string;
  data: string;
  bytes: Buffer;
};

const MAX_IMAGE_RESPONSE_BYTES = 36 * 1024 * 1024;

export async function readBoundedResponseBody(
  response: Response,
  maxBytes = MAX_IMAGE_RESPONSE_BYTES,
): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("Image response size limit is invalid");
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("Self-hosted image response exceeds the safe response-size limit");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Self-hosted image endpoint returned an empty response body");
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      totalBytes += part.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Self-hosted image response exceeds the safe response-size limit");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
}

type LocalImagePayload = {
  data?: Array<{ b64_json?: string; mime_type?: string }>;
  image_base64?: string;
  image?: string;
  images?: string[];
  model?: string;
  error?: { message?: string };
};

function privateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) return true;
  const version = isIP(host);
  if (version === 4) {
    const parts = host.split(".").map(Number);
    const [a,b] = parts;
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (version === 6) return host === "::1" || /^f[cd]/i.test(host) || /^fe80:/i.test(host);
  return false;
}

function localImageEndpoint(): string {
  const endpoint = process.env.LUNAVO_LOCAL_IMAGE_URL?.trim();
  if (!endpoint) throw new Error("LUNAVO_LOCAL_IMAGE_URL is not configured; self-hosted image generation is unavailable");
  let parsed: URL;
  try { parsed = new URL(endpoint); } catch { throw new Error("LUNAVO_LOCAL_IMAGE_URL must be a valid HTTP(S) URL"); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("LUNAVO_LOCAL_IMAGE_URL must use HTTP or HTTPS");
  if (!privateHost(parsed.hostname)) throw new Error("LUNAVO_LOCAL_IMAGE_URL must point to a private/local self-hosted image server");
  return endpoint.replace(/\/$/, "");
}

export function imageResult(bytes: Buffer, mimeType: string, model: string): GeneratedImage {
  const safeMimeType = validateGeneratedRasterImage(bytes, mimeType);
  const encoded = bytes.toString("base64");
  return { model, mimeType: safeMimeType, data: `data:${safeMimeType};base64,${encoded}`, bytes };
}

async function generateLocalImage(prompt: string): Promise<GeneratedImage> {
  const endpoint = localImageEndpoint();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json,image/*" },
    body: JSON.stringify({
      model: process.env.LUNAVO_LOCAL_IMAGE_MODEL?.trim() || "local-image-model",
      prompt: prompt.trim().slice(0, 12000),
      size: process.env.LUNAVO_LOCAL_IMAGE_SIZE?.trim() || "1024x1024",
      response_format: "b64_json",
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const contentType = response.headers.get("content-type")?.split(";")[0].trim() || "";
  const responseBody = await readBoundedResponseBody(response);
  if (!response.ok) {
    let payload: LocalImagePayload = {};
    try { payload = JSON.parse(responseBody.toString("utf8")) as LocalImagePayload; } catch { /* Use the status fallback. */ }
    throw new Error(payload.error?.message || `Self-hosted image endpoint returned HTTP ${response.status}`);
  }
  if (contentType.startsWith("image/")) {
    return imageResult(responseBody, contentType, process.env.LUNAVO_LOCAL_IMAGE_MODEL?.trim() || "local-image-model");
  }

  let payload: LocalImagePayload = {};
  try { payload = JSON.parse(responseBody.toString("utf8")) as LocalImagePayload; } catch { /* Reject below as missing embedded image. */ }
  const first = payload.data?.[0];
  const encoded = first?.b64_json || payload.image_base64 || payload.image || payload.images?.[0];
  if (typeof encoded !== "string" || !encoded.trim()) throw new Error("Self-hosted image endpoint returned no embedded image");
  const mimeType = first?.mime_type || "image/png";
  const bytes = Buffer.from(encoded.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, ""), "base64");
  return imageResult(bytes, mimeType, payload.model || process.env.LUNAVO_LOCAL_IMAGE_MODEL?.trim() || "local-image-model");
}

export async function generateImage(prompt: string): Promise<GeneratedImage> {
  if (!prompt.trim()) throw new Error("Image prompt is required");
  return generateLocalImage(prompt);
}
