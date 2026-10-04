import { createHash } from "node:crypto";

export type LocalAiMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" | "original" } }
  >;
};

type LocalChatOptions = {
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  timeoutMs?: number;
};

function endpoint(): string {
  const value = process.env.LUNAVO_LOCAL_LLM_URL?.trim();
  if (!value) throw new Error("Self-hosted AI is not configured. Set LUNAVO_LOCAL_LLM_URL to a local Ollama/LocalAI/vLLM-compatible endpoint.");
  return value.replace(/\/$/, "");
}

function model(): string {
  return process.env.LUNAVO_LOCAL_LLM_MODEL?.trim() || "qwen3:8b";
}

function requestHeaders() {
  return { Accept: "application/json", "Content-Type": "application/json" };
}

function extractChatContent(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  const ollama = payload?.message?.content;
  if (typeof ollama === "string" && ollama.trim()) return ollama.trim();
  const response = payload?.response;
  if (typeof response === "string" && response.trim()) return response.trim();
  throw new Error("Self-hosted AI returned no usable text");
}

export async function completeLocalChat(messages: LocalAiMessage[], options: LocalChatOptions = {}): Promise<{ model: string; content: string }> {
  const url = endpoint();
  const selectedModel = options.model || model();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 90_000);
  try {
    const payload = {
      model: selectedModel,
      messages,
      stream: false,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 4000,
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    };
    const response = await fetch(url, { method: "POST", headers: requestHeaders(), body: JSON.stringify(payload), signal: controller.signal });
    const text = await response.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    if (!response.ok) throw new Error(`Self-hosted AI returned HTTP ${response.status}`);
    return { model: String(body?.model || selectedModel), content: extractChatContent(body) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function completeLocalVisionJson(prompt: string, imageUrl: string, options: { maxTokens?: number; timeoutMs?: number } = {}): Promise<{ model: string; content: string }> {
  if (!/^https?:\/\//i.test(imageUrl) || imageUrl.length > 8192) throw new Error("Image analysis requires a supported public HTTP(S) URL");
  return completeLocalChat([
    {
      role: "system",
      content: "Return strict JSON only. Never invent facts that are not supported by the supplied image or evidence.",
    },
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageUrl, detail: "auto" } },
      ],
    },
  ], { json: true, maxTokens: options.maxTokens ?? 2500, timeoutMs: options.timeoutMs ?? 90_000 });
}

export function selfHostedAiConfigured(): boolean {
  return Boolean(process.env.LUNAVO_LOCAL_LLM_URL?.trim());
}

export function fingerprintSelfHostedEndpoint(): string | null {
  const value = process.env.LUNAVO_LOCAL_LLM_URL?.trim();
  return value ? createHash("sha256").update(value).digest("hex").slice(0, 12) : null;
}
