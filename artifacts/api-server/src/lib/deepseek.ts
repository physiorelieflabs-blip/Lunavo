type LocalMessage = { role: "system" | "user" | "assistant"; content: string | Array<Record<string, unknown>> };
type LocalResponse = { model?: string; message?: { content?: string }; response?: string; error?: string };

function localConfig() {
  const baseUrl = (process.env.LUNAVO_LOCAL_LLM_URL?.trim() || "http://127.0.0.1:11434/api/chat").replace(/\\/$/, "");
  const model = process.env.LUNAVO_LOCAL_LLM_MODEL?.trim() || "qwen3:32b";
  return { baseUrl, model };
}

async function localChat(messages: LocalMessage[], options: { json?: boolean; maxTokens?: number } = {}) {
  const { baseUrl, model } = localConfig();
  const payload = {
    model,
    messages,
    stream: false,
    options: { num_predict: options.maxTokens || 4000 },
    ...(options.json ? { format: "json" } : {}),
  };
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await response.json().catch(() => ({}))) as LocalResponse;
  if (!response.ok) throw new Error(body.error || `Self-hosted LLM returned HTTP ${response.status}`);
  const content = body.message?.content?.trim() || body.response?.trim();
  if (!content) throw new Error("Self-hosted LLM returned an empty response");
  return { model: body.model || model, content };
}

export async function completeDeepSeekChat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: { json?: boolean; maxTokens?: number; reasoningEffort?: "low" | "high" | "max" } = {},
): Promise<{ model: string; content: string }> {
  return localChat(messages, options);
}

export function deepSeekConfigured(): boolean {
  return Boolean((process.env.LUNAVO_LOCAL_LLM_URL?.trim() || "http://127.0.0.1:11434/api/chat"));
}

function rejectUnsafeImageUrl(value: string) {
  if (!/^https?:\\/\\//i.test(value) || value.length > 8192) throw new Error("Supplier image URL is not a supported public HTTP(S) URL");
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || /^(10|127)\\./.test(host) || /^192\\.168\\./.test(host) || /^172\\.(1[6-9]|2\\d|3[0-1])\\./.test(host))
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
  const content = [
    { type: "text", text: prompt },
    { type: "image", image: Buffer.from(bytes).toString("base64") },
  ];
  return localChat([{ role: "user", content }], { json: true, maxTokens: options.maxTokens || 2500 });
}
