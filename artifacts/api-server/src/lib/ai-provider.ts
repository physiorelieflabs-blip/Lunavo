type ReasoningRole = "primary" | "critic" | "vision" | "coding";
type ReasoningMessage = { role: "system" | "user" | "assistant"; content: string };
type VisionMessageContent = string | Array<
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "original" | "auto" } }
>;
type LocalCompletion = { choices?: Array<{ message?: { content?: string | null } }>; model?: string; error?: { message?: string } };
export type LocalLlmEndpoint = { id: string; url: string; model: string; role?: ReasoningRole; weight: number };

function endpointUrl(value: string, name: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(name + " must be a valid HTTP(S) URL"); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(name + " must use HTTP or HTTPS");
  return value.replace(/\/$/, "");
}

function parsePool(): LocalLlmEndpoint[] {
  const raw = process.env.LUNAVO_LOCAL_LLM_POOL?.trim();
  if (raw) {
    let decoded: unknown;
    try { decoded = JSON.parse(raw); } catch { throw new Error("LUNAVO_LOCAL_LLM_POOL must be valid JSON"); }
    if (!Array.isArray(decoded) || decoded.length < 1 || decoded.length > 4) throw new Error("LUNAVO_LOCAL_LLM_POOL must contain 1 to 4 local endpoints");
    return decoded.map((item, index) => {
      if (!item || typeof item !== "object") throw new Error("Each LUNAVO_LOCAL_LLM_POOL item must be an object");
      const value = item as Record<string, unknown>;
      const url = typeof value.url === "string" ? value.url.trim() : "";
      const model = typeof value.model === "string" && value.model.trim() ? value.model.trim() : (process.env.LUNAVO_LOCAL_LLM_MODEL?.trim() || "local-model");
      const id = typeof value.id === "string" && /^[a-z0-9._-]{1,64}$/i.test(value.id) ? value.id : "local-" + String(index + 1);
      const role = typeof value.role === "string" && ["primary","critic","vision","coding"].includes(value.role) ? value.role as ReasoningRole : undefined;
      const weight = Number(value.weight ?? 1);
      if (!url) throw new Error("LUNAVO_LOCAL_LLM_POOL item " + id + " is missing url");
      if (!Number.isFinite(weight) || weight <= 0 || weight > 100) throw new Error("LUNAVO_LOCAL_LLM_POOL weight must be between 0 and 100");
      return { id, url: endpointUrl(url, "LUNAVO_LOCAL_LLM_POOL item " + id), model, role, weight };
    });
  }
  const endpoint = process.env.LUNAVO_LOCAL_LLM_URL?.trim();
  if (!endpoint) return [];
  return [{ id: "default", url: endpointUrl(endpoint, "LUNAVO_LOCAL_LLM_URL"), model: process.env.LUNAVO_LOCAL_LLM_MODEL?.trim() || "local-model", weight: 1 }];
}

function endpointsFor(options: { reasoningEffort?: "low" | "high" | "max"; role?: ReasoningRole }) {
  const pool = parsePool();
  const compatible = options.role ? pool.filter((item) => !item.role || item.role === options.role) : pool;
  const ordered = (compatible.length ? compatible : pool).slice().sort((a, b) => b.weight - a.weight);
  const fanout = options.reasoningEffort === "max" ? 4 : options.reasoningEffort === "high" ? 3 : 1;
  return ordered.slice(0, fanout);
}

async function completeEndpoint(endpoint: LocalLlmEndpoint, messages: Array<{ role: "system" | "user" | "assistant"; content: VisionMessageContent }>, options: { json?: boolean; maxTokens?: number; reasoningEffort?: "low" | "high" | "max" } = {}) {
  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ model: endpoint.model, messages, temperature: 0.2, max_tokens: options.maxTokens || 4000, ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}), ...(options.json ? { response_format: { type: "json_object" } } : {}) }),
    signal: AbortSignal.timeout(90_000),
  });
  const payload = (await response.json().catch(() => ({}))) as LocalCompletion;
  if (!response.ok) throw new Error(payload.error?.message || "Self-hosted LLM request failed");
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Self-hosted LLM returned an empty response");
  return { model: payload.model || endpoint.model, content };
}

function consensusMessages(original: ReasoningMessage[], candidates: Array<{model:string;content:string}>) {
  const task = original.map((m) => m.role.toUpperCase() + ": " + m.content).join("\n\n").slice(0, 18000);
  const evidence = candidates.map((c, i) => "CANDIDATE " + String(i + 1) + " [" + c.model + "]\n" + c.content.slice(0, 7000)).join("\n\n");
  return [
    { role: "system" as const, content: "You are Lunavo's local verification judge. Combine independent local model answers, prefer agreement and explicit evidence, preserve uncertainty, and never invent facts, payment state, inventory, research citations, provider results, or tool results. Return only the final answer." },
    { role: "user" as const, content: "ORIGINAL TASK\n" + task + "\n\nLOCAL CANDIDATES\n" + evidence },
  ];
}

export async function getLocalAiPool(): Promise<LocalLlmEndpoint[]> { return parsePool(); }

export async function completePrimaryReasoning(
  messages: ReasoningMessage[],
  options: { json?: boolean; maxTokens?: number; reasoningEffort?: "low" | "high" | "max"; role?: ReasoningRole } = {},
): Promise<{ model: string; content: string }> {
  const endpoints = endpointsFor(options);
  if (!endpoints.length) throw new Error("No self-hosted Lunavo LLM is configured; set LUNAVO_LOCAL_LLM_URL or LUNAVO_LOCAL_LLM_POOL");
  if (endpoints.length === 1) return completeEndpoint(endpoints[0]!, messages, options);
  const candidates = (await Promise.allSettled(endpoints.map((endpoint) => completeEndpoint(endpoint, messages, options)))).flatMap((x) => x.status === "fulfilled" ? [x.value] : []);
  if (!candidates.length) throw new Error("All self-hosted Lunavo LLM candidates failed");
  if (candidates.length === 1) return candidates[0]!;
  try {
    const judged = await completeEndpoint(endpoints[0]!, consensusMessages(messages, candidates), { json: options.json, maxTokens: options.maxTokens || 5000, reasoningEffort: "high" });
    return { model: judged.model + " (local consensus)", content: judged.content };
  } catch {
    return { model: candidates[0]!.model + " (local ensemble)", content: candidates[0]!.content };
  }
}

export async function completeLocalVisionJson(
  prompt: string,
  imageUrl: string,
  options: { maxTokens?: number; detail?: "low" | "high" | "original" | "auto" } = {},
): Promise<{ model: string; content: string }> {
  if (imageUrl.length > 8192) throw new Error("Vision input must be a valid HTTP(S) image URL");
  try { const parsed = new URL(imageUrl); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(); } catch { throw new Error("Vision input must be a valid HTTP(S) image URL"); }
  const pool = endpointsFor({ reasoningEffort: "high", role: "vision" });
  if (!pool.length) throw new Error("No self-hosted vision model is configured");
  const result = await completeEndpoint(pool[0]!, [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageUrl, detail: options.detail || "low" } }] }], { json: true, maxTokens: options.maxTokens || 2500, reasoningEffort: "high" });
  return result;
}
export function localAiConfigured(): boolean { return parsePool().length > 0; }
export function localAiPoolSummary() { return parsePool().map((item) => ({ id:item.id, model:item.model, ...(item.role ? {role:item.role} : {}), weight:item.weight })); }
