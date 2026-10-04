type LocalMessage = { role: "system" | "user" | "assistant"; content: string | Array<Record<string, unknown>> };
import { completeLocalBrain } from "./local-ai-brain";
type LocalResponse = { model?: string; choices?: Array<{ message?: { content?: string | null } }>; error?: { message?: string } };

function localConfig(vision = false) {
  const baseUrl = (process.env.LUNAVO_LOCAL_LLM_URL?.trim() || "http://127.0.0.1:11434/v1/chat/completions").replace(/\/$/, "");
  const model = (vision ? process.env.LUNAVO_LOCAL_VISION_MODEL?.trim() : process.env.LUNAVO_LOCAL_LLM_MODEL?.trim()) || (vision ? "qwen2.5vl:32b" : "qwen3:32b");
  return { baseUrl, model };
}

async function localChat(messages: LocalMessage[], options: { json?: boolean; maxTokens?: number; vision?: boolean } = {}) {
  const result = await completeLocalBrain(messages, {
    json: options.json,
    maxTokens: options.maxTokens || 4000,
    role: options.vision ? "vision" : "reasoning",
  });
  return { model: result.model, content: result.content };
}

export async function completeDeepSeekChat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: { json?: boolean; maxTokens?: number; reasoningEffort?: "low" | "high" | "max" } = {},
): Promise<{ model: string; content: string }> {
  return localChat(messages, options);
}

export function deepSeekConfigured(): boolean {
  return Boolean(process.env.LUNAVO_LOCAL_LLM_URL?.trim() || true);
}

function rejectUnsafeImageUrl(value: string) {
  if (!/^https?:\/\//i.test(value) || value.length > 8192) throw new Error("Supplier image URL is not a supported public HTTP(S) URL");
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || /^(10|127)\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host))
    throw new Error("Supplier image URL resolves to a private/local address");
}

export async function completeDeepSeekVisionJson(
  prompt: string,
  imageUrl: string,
  options: { maxTokens?: number; detail?: "low" | "high" | "original" | "auto" } = {},
): Promise<{ model: string; content: string }> {
  rejectUnsafeImageUrl(imageUrl);
  const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
  if (!imageResponse.ok) throw new Error(`Supplier image fetch returned HTTP ${imageResponse.status}`);
  const mime = imageResponse.headers.get("content-type")?.split(";")[0].trim() || "image/jpeg";
  if (!mime.startsWith("image/")) throw new Error("Supplier image URL did not return an image");
  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("Supplier image is empty or exceeds the 10 MB analysis limit");
  const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
  return localChat([{
    role: "user",
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: dataUrl, detail: options.detail || "low" } },
    ],
  }], { json: true, maxTokens: options.maxTokens || 2500, vision: true });
}
