export type LocalMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenAICompatibleResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

/**
 * Self-hosted intelligence gateway.
 *
 * The default endpoint is loopback-only and speaks the OpenAI-compatible
 * protocol implemented by common local runtimes. No hosted AI provider is
 * required. Keep this module as the only network boundary for language-model
 * inference so individual commerce features cannot accidentally acquire a
 * vendor lock-in or a hidden cloud dependency.
 */
const baseUrl = (process.env.LUNAVO_LOCAL_AI_BASE_URL?.trim() || "http://127.0.0.1:11434/v1").replace(/\/$/, "");
const model = process.env.LUNAVO_LOCAL_AI_MODEL?.trim() || "llama3.3";
const timeoutMs = Math.max(5_000, Number(process.env.LUNAVO_LOCAL_AI_TIMEOUT_MS) || 60_000);

export function localAiConfig() {
  return { baseUrl, model, timeoutMs };
}

export async function completeLocalChat(messages: LocalMessage[], options?: { json?: boolean; maxTokens?: number }): Promise<{ model: string; content: string }> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: options?.maxTokens ?? 1600,
      ...(options?.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = (await response.json().catch(() => ({}))) as OpenAICompatibleResponse;
  if (!response.ok) throw new Error(payload.error?.message || `Local AI runtime returned HTTP ${response.status}`);
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Local AI runtime returned an empty response");
  return { model, content };
}

export async function generateLocalImage(prompt: string, options?: { width?: number; height?: number; negativePrompt?: string }): Promise<Buffer> {
  const endpoint = process.env.LUNAVO_LOCAL_IMAGE_URL?.trim() || "http://127.0.0.1:8188";
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt,
      negative_prompt: options?.negativePrompt,
      width: options?.width ?? 1024,
      height: options?.height ?? 1024,
    }),
    signal: AbortSignal.timeout(Math.max(30_000, Number(process.env.LUNAVO_LOCAL_IMAGE_TIMEOUT_MS) || 180_000)),
  });
  if (!response.ok) throw new Error(`Local image runtime returned HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) throw new Error("Local image runtime did not return an image");
  return Buffer.from(await response.arrayBuffer());
}
