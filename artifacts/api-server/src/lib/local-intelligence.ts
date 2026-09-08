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

export type LocalVideoOptions = {
  width?: number;
  height?: number;
  seconds?: number;
  fps?: number;
  /**
   * Seamless stitching is enabled by default. The local worker should render
   * short coherent segments and stitch them with overlap-aware transitions,
   * temporal continuity and audio-safe boundaries rather than hard cuts.
   */
  seamlessStitching?: boolean;
  /** Number of frames to overlap between adjacent generated segments. */
  overlapFrames?: number;
  /** Preferred transition strategy understood by the local video worker. */
  transition?: "crossfade" | "motion_blend" | "match_cut" | "auto";
};

/**
 * Local video-generation boundary with seamless stitching.
 *
 * The worker may use ComfyUI/FFmpeg or another self-hosted pipeline. The
 * application sends an explicit stitching contract so longer videos can be
 * assembled from coherent segments while preserving subject, camera motion,
 * color, lighting and audio continuity. No cloud video API key is accepted.
 */
export async function generateLocalVideo(prompt: string, options?: LocalVideoOptions): Promise<Buffer> {
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
      stitching: {
        enabled: options?.seamlessStitching ?? true,
        overlap_frames: options?.overlapFrames ?? 12,
        transition: options?.transition ?? "auto",
        temporal_consistency: true,
        subject_consistency: true,
        camera_continuity: true,
        color_continuity: true,
        audio_continuity: true,
      },
    }),
    signal: AbortSignal.timeout(Math.max(60_000, Number(process.env.LUNAVO_LOCAL_VIDEO_TIMEOUT_MS) || 600_000)),
  });
  if (!response.ok) throw new Error(`Local video runtime returned HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("video/")) throw new Error("Local video runtime did not return a video");
  return Buffer.from(await response.arrayBuffer());
}
