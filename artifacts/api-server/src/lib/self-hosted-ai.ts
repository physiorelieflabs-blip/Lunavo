import { createHash } from "node:crypto";

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
  review: { model: "qwen3:14b", timeoutMs: 120_000 },
};

function globalEndpoint(): string {
  const direct = process.env.LUNAVO_LOCAL_LLM_URL?.trim();
  if (direct) return direct.replace(/\/$/, "");

  const base = process.env.LUNAVO_LOCAL_AI_BASE_URL?.trim();
  if (base) {
    const normalized = base.replace(/\/$/, "");
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
    url: configured.url?.replace(/\/$/, "") || globalEndpoint(),
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

async function postChat(
  messages: LocalAiMessage[],
  options: LocalChatOptions,
): Promise<{ model: string; content: string; profile: LocalAiProfile }> {
  const profile = options.profile || "general";
  const selected = resolveLocalAiProfile(profile, options.model);
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
  return Boolean(process.env.LUNAVO_LOCAL_LLM_URL?.trim() || process.env.LUNAVO_LOCAL_AI_BASE_URL?.trim());
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
