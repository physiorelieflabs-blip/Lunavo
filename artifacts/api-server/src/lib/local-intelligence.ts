export type LocalMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenAICompatibleResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

/** Self-hosted intelligence gateway; no hosted AI key is required. */
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
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: options?.maxTokens ?? 1600, ...(options?.json ? { response_format: { type: "json_object" } } : {}) }),
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
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, negative_prompt: options?.negativePrompt, width: options?.width ?? 1024, height: options?.height ?? 1024 }),
    signal: AbortSignal.timeout(Math.max(30_000, Number(process.env.LUNAVO_LOCAL_IMAGE_TIMEOUT_MS) || 180_000)),
  });
  if (!response.ok) throw new Error(`Local image runtime returned HTTP ${response.status}`);
  if (!(response.headers.get("content-type") || "").startsWith("image/")) throw new Error("Local image runtime did not return an image");
  return Buffer.from(await response.arrayBuffer());
}

export type LocalVideoOptions = {
  width?: number;
  height?: number;
  /** Final stitched duration. Product range is 5-10 minutes. */
  seconds?: number;
  /** Human-friendly duration such as "7 minutes", "7m", or "420s". */
  duration?: string | number;
  fps?: number;
  seamlessStitching?: boolean;
  overlapFrames?: number;
  transition?: "crossfade" | "motion_blend" | "match_cut" | "auto";
};

/** Convert a UI/user duration into seconds while keeping one canonical range. */
export function parseLocalVideoDuration(duration?: string | number): number {
  if (duration === undefined || duration === null || duration === "") return 300;
  if (typeof duration === "number") return duration;
  const value = duration.trim().toLowerCase();
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)$/);
  if (!match) throw new Error("Video duration must be written as seconds or minutes, for example 420s or 7 minutes");
  const amount = Number(match[1]);
  const unit = match[2];
  return unit.startsWith("m") ? amount * 60 : amount;
}

/**
 * Self-hosted long-form video boundary. The requested duration is the FINAL
 * stitched duration, not the duration of one generation segment. The worker
 * should generate short coherent clips, maintain continuity metadata between
 * clips, and stitch them into a single 5-10 minute deliverable.
 */
export async function generateLocalVideo(prompt: string, options?: LocalVideoOptions): Promise<Buffer> {
  const endpoint = process.env.LUNAVO_LOCAL_VIDEO_URL?.trim() || "http://127.0.0.1:8189";
  const requestedSeconds = parseLocalVideoDuration(options?.duration ?? options?.seconds);
  if (!Number.isFinite(requestedSeconds) || requestedSeconds < 300 || requestedSeconds > 600) {
    throw new Error("Self-hosted long-form video duration must be between 5 and 10 minutes");
  }

  const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt,
      width: options?.width ?? 1280,
      height: options?.height ?? 720,
      seconds: requestedSeconds,
      fps: options?.fps ?? 24,
      stitching: {
        enabled: options?.seamlessStitching ?? true,
        target_duration_seconds: requestedSeconds,
        segment_seconds: 8,
        overlap_frames: options?.overlapFrames ?? 12,
        transition: options?.transition ?? "auto",
        temporal_consistency: true,
        subject_consistency: true,
        camera_continuity: true,
        color_continuity: true,
        lighting_continuity: true,
        audio_continuity: true,
        final_single_file: true,
      },
    }),
    signal: AbortSignal.timeout(Math.max(600_000, Number(process.env.LUNAVO_LOCAL_VIDEO_TIMEOUT_MS) || 1_800_000)),
  });
  if (!response.ok) throw new Error(`Local video runtime returned HTTP ${response.status}`);
  if (!(response.headers.get("content-type") || "").startsWith("video/")) throw new Error("Local video runtime did not return a video");
  return Buffer.from(await response.arrayBuffer());
}
