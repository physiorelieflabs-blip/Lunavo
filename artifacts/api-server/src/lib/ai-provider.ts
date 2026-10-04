type ReasoningMessage = { role: "system" | "user" | "assistant"; content: string };
type VisionMessageContent = string | Array<
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "original" | "auto" } }
>;

type LocalCompletion = { choices?: Array<{ message?: { content?: string | null } }>; model?: string; error?: { message?: string } };

function localEndpoint(): string {
  const endpoint = process.env.LUNAVO_LOCAL_LLM_URL?.trim();
  if (!endpoint) throw new Error("LUNAVO_LOCAL_LLM_URL is not configured; self-hosted AI is unavailable");
  let parsed: URL;
  try { parsed = new URL(endpoint); } catch { throw new Error("LUNAVO_LOCAL_LLM_URL must be a valid HTTP(S) URL"); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("LUNAVO_LOCAL_LLM_URL must use HTTP or HTTPS");
  return endpoint.replace(/\/$/, "");
}

async function completeLocal(messages: Array<{ role: "system" | "user" | "assistant"; content: VisionMessageContent }>, options: { json?: boolean; maxTokens?: number; reasoningEffort?: "low" | "high" | "max" } = {}): Promise<{ model: string; content: string }> {
  const endpoint = localEndpoint();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      model: process.env.LUNAVO_LOCAL_LLM_MODEL?.trim() || "local-model",
      messages,
      temperature: 0.2,
      max_tokens: options.maxTokens || 4000,
      ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const payload = (await response.json().catch(() => ({}))) as LocalCompletion;
  if (!response.ok) throw new Error(payload.error?.message || `Self-hosted LLM returned HTTP ${response.status}`);
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Self-hosted LLM returned an empty response");
  return { model: payload.model || process.env.LUNAVO_LOCAL_LLM_MODEL?.trim() || "local-model", content };
}

export async function completePrimaryReasoning(
  messages: ReasoningMessage[],
  options: { json?: boolean; maxTokens?: number; reasoningEffort?: "low" | "high" | "max" } = {},
): Promise<{ model: string; content: string }> {
  return completeLocal(messages, options);
}

export async function completeLocalVisionJson(
  prompt: string,
  imageUrl: string,
  options: { maxTokens?: number; detail?: "low" | "high" | "original" | "auto" } = {},
): Promise<{ model: string; content: string }> {
  if (!/^https?:\\/\\//i.test(imageUrl) || imageUrl.length > 8192) throw new Error("Vision input must be a valid HTTP(S) image URL");
  return completeLocal([{
    role: "user",
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: imageUrl, detail: options.detail || "low" } },
    ],
  }], { json: true, maxTokens: options.maxTokens || 2500, reasoningEffort: "high" });
}

export function localAiConfigured(): boolean {
  return Boolean(process.env.LUNAVO_LOCAL_LLM_URL?.trim());
}
