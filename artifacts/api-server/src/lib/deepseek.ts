type DeepSeekMessage = { role: "system" | "user" | "assistant"; content: string };

type DeepSeekResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

function deepSeekConfig() {
  const apiKey = process.env.LUNAVO_DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("LUNAVO_DEEPSEEK_API_KEY is not configured");
  const baseUrl = (process.env.LUNAVO_DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com").replace(/\/$/, "");
  const model = process.env.LUNAVO_DEEPSEEK_MODEL?.trim() || "deepseek-v4-pro";
  return { apiKey, baseUrl, model };
}

export async function completeDeepSeekChat(
  messages: DeepSeekMessage[],
  options: { json?: boolean; maxTokens?: number; reasoningEffort?: "low" | "high" | "max" } = {},
): Promise<{ model: string; content: string }> {
  const { apiKey, baseUrl, model } = deepSeekConfig();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      thinking: { type: "enabled" },
      reasoning_effort: options.reasoningEffort || "high",
      max_tokens: options.maxTokens || 4000,
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const payload = (await response.json().catch(() => ({}))) as DeepSeekResponse;
  if (!response.ok) throw new Error(payload.error?.message || `DeepSeek returned HTTP ${response.status}`);
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("DeepSeek returned an empty response");
  return { model: payload.model || model, content };
}

export function deepSeekConfigured(): boolean {
  return Boolean(process.env.LUNAVO_DEEPSEEK_API_KEY?.trim());
}

type DeepSeekVisionResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

export async function completeDeepSeekVisionJson(
  prompt: string,
  imageUrl: string,
  options: { maxTokens?: number; detail?: "low" | "high" | "original" | "auto" } = {},
): Promise<{ model: string; content: string }> {
  const { apiKey, baseUrl } = deepSeekConfig();
  const model = process.env.LUNAVO_DEEPSEEK_VISION_MODEL?.trim() || "deepseek-flash";
  if (!/^https?:\/\//i.test(imageUrl) || imageUrl.length > 8192) {
    throw new Error("Supplier image URL is not a supported public HTTP(S) URL");
  }
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl, detail: options.detail || "low" } },
        ],
      }],
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      max_tokens: options.maxTokens || 2500,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const payload = (await response.json().catch(() => ({}))) as DeepSeekVisionResponse;
  if (!response.ok) throw new Error(payload.error?.message || `DeepSeek vision returned HTTP ${response.status}`);
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("DeepSeek vision returned an empty response");
  return { model: payload.model || model, content };
}
