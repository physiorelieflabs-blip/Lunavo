import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_REDIRECTS = 2;
const IMAGE_DNS_TIMEOUT_MS = 3_000;

function blockedImageAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return blockedImageAddress(normalized.slice("::ffff:".length));
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

async function resolveImageHost(hostname: string): Promise<string> {
  const resolved = isIP(hostname)
    ? [hostname]
    : await Promise.race([
        lookup(hostname, { all: true, verbatim: true }).then((entries) => entries.map((entry) => entry.address)),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Supplier image DNS lookup timed out")), IMAGE_DNS_TIMEOUT_MS)),
      ]);
  if (!resolved.length || resolved.some(blockedImageAddress)) throw new Error("Supplier image URL resolves to a private/local address");
  return resolved[0]!;
}

async function fetchPublicImage(input: string): Promise<{ response: { headers: Headers; ok: boolean; status: number }; bytes: Buffer }> {
  let url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Supplier image URL must use http or https");
  for (let redirect = 0; redirect <= MAX_IMAGE_REDIRECTS; redirect += 1) {
    const address = await resolveImageHost(url.hostname);
    const response = await new Promise<{ status:number; headers:Headers; body:Buffer; location:string|null }>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)({
        hostname: address,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        servername: isIP(url.hostname) ? undefined : url.hostname,
        rejectUnauthorized: true,
        headers: { accept: "image/*", host: url.host, "user-agent": "Lunavo-Supplier-Image-Analyzer/1.0" },
        timeout: 8_000,
      }, (res) => {
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_IMAGE_BYTES) {
            request.destroy(new Error("Supplier image exceeds the 10 MB analysis limit"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({
          status: res.statusCode ?? 0,
          headers: new Headers(Object.entries(res.headers).reduce<Record<string,string>>((out,[key,value]) => { out[key] = Array.isArray(value) ? value.join(",") : value ?? ""; return out; }, {})),
          body: Buffer.concat(chunks),
          location: typeof res.headers.location === "string" ? res.headers.location : null,
        }));
        res.on("error", reject);
      });
      request.on("timeout", () => request.destroy(new Error("Supplier image request timed out")));
      request.on("error", reject);
      request.end();
    });
    if (response.status >= 300 && response.status < 400 && response.location) {
      if (redirect === MAX_IMAGE_REDIRECTS) throw new Error("Supplier image redirected too many times");
      url = new URL(response.location, url);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Supplier image redirect used an unsupported protocol");
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`Supplier image fetch returned HTTP ${response.status}`);
    return { response: { headers: response.headers, ok: true, status: response.status }, bytes: response.body };
  }
  throw new Error("Supplier image fetch failed");
}

type LocalMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
};

import { completeLocalBrain } from "./local-ai-brain";

const DEFAULT_LOCAL_LLM_URL = "http://127.0.0.1:11434/v1/chat/completions";
const DEFAULT_LOCAL_LLM_MODEL = "qwen3:32b";

function localChat(
  messages: LocalMessage[],
  options: { json?: boolean; maxTokens?: number; vision?: boolean } = {},
) {
  return completeLocalBrain(messages, {
    json: options.json,
    maxTokens: options.maxTokens ?? 4000,
    role: options.vision ? "vision" : "reasoning",
  });
}

export async function completeDeepSeekChat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: { json?: boolean; maxTokens?: number; reasoningEffort?: "low" | "high" | "max" } = {},
): Promise<{ model: string; content: string }> {
  const result = await localChat(messages, options);
  return { model: result.model, content: result.content };
}

export function deepSeekConfigured(): boolean {
  // A local endpoint always exists by default; production provisioning is checked by preflight.
  const endpoint = process.env.LUNAVO_LOCAL_LLM_URL?.trim() ||
    process.env.LUNAVO_LOCAL_LLM_URLS?.trim() ||
    DEFAULT_LOCAL_LLM_URL;
  const model = process.env.LUNAVO_LOCAL_LLM_MODEL?.trim() || DEFAULT_LOCAL_LLM_MODEL;
  // OpenAI-compatible local backends may use response_format for structured JSON; the local brain maps this to each native protocol.
  return Boolean(endpoint && model);
}

function rejectUnsafeImageUrl(value: string): void {
  if (!/^https?:\/\//i.test(value) || value.length > 8192) {
    throw new Error("Supplier image URL is not a supported public HTTP(S) URL");
  }
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    /^(10|127)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    throw new Error("Supplier image URL resolves to a private/local address");
  }
}

export async function completeDeepSeekVisionJson(
  prompt: string,
  imageUrl: string,
  options: { maxTokens?: number; detail?: "low" | "high" | "original" | "auto" } = {},
): Promise<{ model: string; content: string }> {
  rejectUnsafeImageUrl(imageUrl);
  const fetched = await fetchPublicImage(imageUrl);
  const mime = fetched.response.headers.get("content-type")?.split(";")[0].trim() || "image/jpeg";
  if (!mime.startsWith("image/")) {
    throw new Error("Supplier image URL did not return an image");
  }
  const bytes = fetched.bytes;
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("Supplier image is empty or exceeds the 10 MB analysis limit");
  }
  const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
  return localChat(
    [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: options.detail ?? "low" },
          },
        ],
      },
    ],
    { json: true, maxTokens: options.maxTokens ?? 2500, vision: true },
  );
}
