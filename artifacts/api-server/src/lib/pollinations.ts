import { isIP } from "node:net";
type GeneratedImage = {
  model: string;
  mimeType: string;
  data: string;
  bytes: Buffer;
};

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

function imageResult(bytes: Buffer, mimeType: string, model: string): GeneratedImage {
  if (!mimeType.startsWith("image/")) throw new Error("Self-hosted image endpoint returned a non-image MIME type");
  if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new Error("Self-hosted image endpoint returned an invalid image size");
  const encoded = bytes.toString("base64");
  return { model, mimeType, data: `data:${mimeType};base64,${encoded}`, bytes };
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
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as LocalImagePayload;
    throw new Error(payload.error?.message || `Self-hosted image endpoint returned HTTP ${response.status}`);
  }
  if (contentType.startsWith("image/")) {
    return imageResult(Buffer.from(await response.arrayBuffer()), contentType, process.env.LUNAVO_LOCAL_IMAGE_MODEL?.trim() || "local-image-model");
  }

  const payload = (await response.json().catch(() => ({}))) as LocalImagePayload;
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
