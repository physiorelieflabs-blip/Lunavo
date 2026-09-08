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
 * This is the single inference boundary for TS Commerce. It speaks the
 * OpenAI-compatible protocol exposed by local runtimes such as Ollama and
 * llama.cpp servers, but it never requires a hosted AI API key.
 *
 * Default brain: DeepSeek-R1 14B. Operators can choose another locally
 * installed model with LUNAVO_LOCAL_AI_MODEL without changing application
 * features. Financial state, permissions and irreversible actions must never
 * be delegated to the model.
 */
const baseUrl = (process.env.LUNAVO_LOCAL_AI_BASE_URL?.trim() || "http://127.0.0.1:11434/v1").replace(/\/$/, "");
const model = process.env.LUNAVO_LOCAL_AI_MODEL?.trim() || "deepseek-r1:14b";
const timeoutMs = Math.max(5_000, Number(process.env.LUNAVO_LOCAL_AI_TIMEOUT_MS) || 90_000);

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

/**
 * Local image generation boundary. The application only talks to this local
 * adapter; the adapter may be backed by ComfyUI, Stable Diffusion/Flux or
 * another self-hosted renderer implementing the small /api/generate contract.
 */
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

/**
 * Local video-generation boundary. Video generation is deliberately an
 * adapter contract rather than a fake implementation: a self-hosted video
 * worker (for example a ComfyUI/FFmpeg-based pipeline) must return an actual
 * video response. No cloud video API key is accepted here.
 */
export async function generateLocalVideo(prompt: string, options?: { width?: number; height?: number; seconds?: number; fps?: number }): Promise<Buffer> {
  const endpoint = process.env.LUNAVO_LOCAL_VIDEO_URL?.trim() || "http://127.0.0.1:8189";
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt,
      width: options?.width ?? 1280,
      height: options?.height ?? 720,
      seconds: options?.seconds ?? 8,
      fps: options?.fps ?? 24,
    }),
    signal: AbortSignal.timeout(Math.max(60_000, Number(process.env.LUNAVO_LOCAL_VIDEO_TIMEOUT_MS) || 600_000)),
  });
  if (!response.ok) throw new Error(`Local video runtime returned HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("video/")) throw new Error("Local video runtime did not return a video");
  return Buffer.from(await response.arrayBuffer());
}
