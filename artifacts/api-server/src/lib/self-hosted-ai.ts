import { createHash } from "node:crypto";
import { isIP } from "node:net";

export type LocalAiMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" | "original" } }
  >;
};

export type LocalAiProfile = "fast" | "general" | "reasoning" | "coding" | "vision" | "review";

type LocalChatOptions = {
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  timeoutMs?: number;
  reasoningEffort?: "low" | "high" | "max";
  profile?: LocalAiProfile;
};

type ResolvedProfile = {
  profile: LocalAiProfile;
  url: string;
  model: string;
};

const PROFILE_DEFAULTS: Record<LocalAiProfile, { model: string; timeoutMs: number }> = {
  fast: { model: "qwen3:4b", timeoutMs: 45_000 },
  general: { model: "qwen3:14b", timeoutMs: 90_000 },
  reasoning: { model: "deepseek-r1:14b", timeoutMs: 180_000 },
  coding: { model: "qwen3-coder:30b", timeoutMs: 180_000 },
  vision: { model: "gemma3:12b", timeoutMs: 120_000 },
  // Keep the critic distinct from the Qwen general model so local consensus has a genuinely independent viewpoint.
  review: { model: "gemma3:12b", timeoutMs: 120_000 },
};

export function assertSelfHostedEndpoint(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Self-hosted AI endpoint must be a valid URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Self-hosted AI endpoint must use HTTP(S)");
  const hostname = url.hostname.toLowerCase();
  const ipVersion = isIP(hostname);
  const privateIpv4 =
    ipVersion === 4 &&
    (() => {
      const [a, b] = hostname.split(".").map(Number);
      return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    })();
  const privateIpv6 = ipVersion === 6 && (hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80:"));
  const localHostname = hostname === "localhost" || hostname === "host.docker.internal" || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".lan") || !hostname.includes(".");
  if (ipVersion && !privateIpv4 && !privateIpv6) throw new Error("Self-hosted AI endpoints must use a private/local network address");
  if (!ipVersion && !localHostname) throw new Error("Self-hosted AI endpoints must use a private/local hostname");
  return value.replace(/\/$/, "");
}

function globalEndpoint(): string {
  const direct = process.env.LUNAVO_LOCAL_LLM_URL?.trim();
  if (direct) return assertSelfHostedEndpoint(direct);

  const base = process.env.LUNAVO_LOCAL_AI_BASE_URL?.trim();
  if (base) {
    const normalized = assertSelfHostedEndpoint(base);
    return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
  }

  throw new Error("Self-hosted AI is not configured. Set LUNAVO_LOCAL_LLM_URL or LUNAVO_LOCAL_AI_BASE_URL.");
}

function configuredProfileEnv(profile: LocalAiProfile): { url?: string; model?: string } {
  const prefix = profile === "fast" ? "FAST"
    : profile === "general" ? "GENERAL"
      : profile === "reasoning" ? "REASONING"
        : profile === "coding" ? "CODING"
          : profile === "vision" ? "VISION"
            : "REVIEW";
  return {
    url: process.env[`LUNAVO_LOCAL_AI_${prefix}_URL`]?.trim() || undefined,
    model: process.env[`LUNAVO_LOCAL_AI_${prefix}_MODEL`]?.trim() || undefined,
  };
}

export function resolveLocalAiProfile(profile: LocalAiProfile = "general", overrideModel?: string): ResolvedProfile {
  const defaults = PROFILE_DEFAULTS[profile];
  const configured = configuredProfileEnv(profile);
  return {
    profile,
    url: configured.url ? assertSelfHostedEndpoint(configured.url) : globalEndpoint(),
    model: overrideModel?.trim() || configured.model || defaults.model,
  };
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

function timeoutFor(profile: LocalAiProfile, options: LocalChatOptions): number {
  const requested = Number(options.timeoutMs);
  if (Number.isFinite(requested) && requested >= 5_000) return Math.min(requested, 900_000);
  return PROFILE_DEFAULTS[profile].timeoutMs;
}

function temperatureFor(options: LocalChatOptions): number {
  if (options.reasoningEffort === "max") return 0.1;
  if (options.reasoningEffort === "low") return 0.3;
  return options.temperature ?? 0.2;
}

let activeInferenceRequests = 0;
const inferenceWaiters: Array<() => void> = [];

function inferenceParallelLimit(): number {
  const configured = Number(process.env.LUNAVO_LOCAL_AI_MAX_PARALLEL);
  return Number.isInteger(configured) && configured > 0 ? Math.min(8, configured) : 2;
}

function releaseInferenceRequestSlot(): void {
  const next = inferenceWaiters.shift();
  if (next) {
    // Transfer the active slot directly to the next waiter so a newly arriving
    // request cannot jump the queue and exceed the concurrency limit.
    next();
    return;
  }
  activeInferenceRequests = Math.max(0, activeInferenceRequests - 1);
}

async function acquireInferenceRequestSlot(): Promise<() => void> {
  if (activeInferenceRequests < inferenceParallelLimit()) {
    activeInferenceRequests += 1;
    return releaseInferenceRequestSlot;
  }
  if (inferenceWaiters.length >= 64) {
    throw new Error("Self-hosted AI queue is full; retry after active inference requests finish");
  }
  await new Promise<void>((resolve) => inferenceWaiters.push(resolve));
  return releaseInferenceRequestSlot;
}

export function selfHostedAiQueueState(): { maxParallel: number; inFlight: number; queued: number } {
  return {
    maxParallel: inferenceParallelLimit(),
    inFlight: activeInferenceRequests,
    queued: inferenceWaiters.length,
  };
}

async function postChat(
  messages: LocalAiMessage[],
  options: LocalChatOptions,
): Promise<{ model: string; content: string; profile: LocalAiProfile }> {
  const profile = options.profile || "general";
  const selected = resolveLocalAiProfile(profile, options.model);
  const releaseSlot = await acquireInferenceRequestSlot();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutFor(profile, options));
  try {
    const payload = {
      model: selected.model,
      messages,
      stream: false,
      temperature: temperatureFor(options),
      max_tokens: options.maxTokens ?? (profile === "coding" ? 7000 : 4000),
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    };
    const response = await fetch(selected.url, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const raw = await response.text();
    let body: any = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    if (!response.ok) {
      const detail = typeof body?.error?.message === "string" ? body.error.message : `HTTP ${response.status}`;
      throw new Error(`Self-hosted AI [${profile}/${selected.model}] failed: ${detail}`);
    }
    return { model: String(body?.model || selected.model), content: extractChatContent(body), profile };
  } finally {
    clearTimeout(timeout);
    releaseSlot();
  }
}

export async function completeLocalChat(
  messages: LocalAiMessage[],
  options: LocalChatOptions = {},
): Promise<{ model: string; profile: LocalAiProfile; content: string }> {
  const response = await postChat(messages, options);
  return { model: response.model, profile: response.profile, content: response.content };
}

export async function completeLocalEnsemble(
  messages: LocalAiMessage[],
  options: {
    profiles?: LocalAiProfile[];
    maxTokens?: number;
    timeoutMs?: number;
    json?: boolean;
  } = {},
): Promise<{
  model: string;
  content: string;
  contributors: string[];
  consensus: "strong" | "mixed" | "single";
}> {
  const profiles = [...new Set(options.profiles?.length ? options.profiles : ["general", "reasoning", "review"])] as LocalAiProfile[];
  const results = await Promise.allSettled(
    profiles.map((profile) => postChat(messages, {
      profile,
      maxTokens: options.maxTokens ?? (profile === "reasoning" ? 3200 : 2400),
      timeoutMs: options.timeoutMs,
      json: options.json,
      reasoningEffort: profile === "reasoning" ? "high" : undefined,
    })),
  );

  const successes = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (successes.length === 0) {
    const errors = results.flatMap((result) => result.status === "rejected" ? [String(result.reason?.message || result.reason)] : []);
    throw new Error(`Self-hosted AI ensemble unavailable: ${errors.slice(0, 2).join(" | ")}`);
  }
  if (successes.length === 1) {
    return { model: successes[0].model, content: successes[0].content, contributors: [successes[0].model], consensus: "single" };
  }

  const synthesisEvidence = successes.map((item, index) => `MODEL_${index + 1} [${item.profile}/${item.model}]:\n${item.content.slice(0, 8_000)}`).join("\n\n");
  try {
    const arbiter = await postChat([
      {
        role: "system",
        content: [
          "You are Lunavo's local ensemble arbiter.",
          "Synthesize the candidate analyses into one answer.",
          "Prefer claims supported by multiple candidates.",
          "Do not invent missing facts.",
          "For factual conflicts, state the uncertainty instead of guessing.",
          "Never create payment, balance, settlement, payout, inventory, or provider facts that are absent from the input.",
          options.json ? "Return strict JSON only." : "Return the best concise final answer.",
        ].join(" "),
      },
      { role: "user", content: `Original task:\n${JSON.stringify(messages)}\n\nCandidate analyses:\n${synthesisEvidence}` },
    ], {
      profile: "review",
      maxTokens: options.maxTokens ?? 3500,
      timeoutMs: options.timeoutMs,
      json: options.json,
      reasoningEffort: "high",
    });
    return {
      model: `ensemble:[${successes.map((item) => item.model).join(",")}]->${arbiter.model}`,
      content: arbiter.content,
      contributors: successes.map((item) => item.model),
      consensus: successes.length === profiles.length ? "strong" : "mixed",
    };
  } catch {
    return {
      model: `ensemble:${successes.map((item) => item.model).join("+")}`,
      content: successes[0].content,
      contributors: successes.map((item) => item.model),
      consensus: "mixed",
    };
  }
}

export async function completeLocalVisionJson(
  prompt: string,
  imageUrl: string,
  options: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<{ model: string; profile: LocalAiProfile; content: string }> {
  if (!/^https?:\/\//i.test(imageUrl) || imageUrl.length > 8192) {
    throw new Error("Image analysis requires a supported public HTTP(S) URL");
  }
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
  ], {
    json: true,
    profile: "vision",
    maxTokens: options.maxTokens ?? 2500,
    timeoutMs: options.timeoutMs ?? 120_000,
  });
}

export function selfHostedAiConfigured(): boolean {
  if (process.env.LUNAVO_LOCAL_LLM_URL?.trim() || process.env.LUNAVO_LOCAL_AI_BASE_URL?.trim()) return true;
  return (["fast", "general", "reasoning", "coding", "vision", "review"] as LocalAiProfile[])
    .some((profile) => Boolean(configuredProfileEnv(profile).url));
}

export function configuredSelfHostedProfiles(): Array<{ profile: LocalAiProfile; model: string; urlConfigured: boolean }> {
  const profiles: LocalAiProfile[] = ["fast", "general", "reasoning", "coding", "vision", "review"];
  return profiles.map((profile) => {
    const configured = configuredProfileEnv(profile);
    return { profile, model: configured.model || PROFILE_DEFAULTS[profile].model, urlConfigured: Boolean(configured.url || process.env.LUNAVO_LOCAL_LLM_URL || process.env.LUNAVO_LOCAL_AI_BASE_URL) };
  });
}

export function fingerprintSelfHostedEndpoint(): string | null {
  const value = process.env.LUNAVO_LOCAL_LLM_URL?.trim() || process.env.LUNAVO_LOCAL_AI_BASE_URL?.trim();
  return value ? createHash("sha256").update(value).digest("hex").slice(0, 12) : null;
}
