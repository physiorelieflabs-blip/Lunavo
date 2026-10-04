export type BrainRole = "reasoning" | "fast" | "vision" | "critic";
export type BrainMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
};
export type BrainOptions = {
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  role?: BrainRole;
  timeoutMs?: number;
  ensemble?: boolean;
  metadata?: Record<string, unknown>;
};

type Candidate = { baseUrl: string; model: string; protocol: "openai" | "ollama" | "llamacpp"; weight: number };
type CandidateResult = { candidate: Candidate; content: string; model: string; latencyMs: number };

function splitList(value: string | undefined): string[] {
  return (value ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}

function cleanUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

function inferProtocol(url: string): Candidate["protocol"] {
  if (url.includes("/api/chat")) return "ollama";
  if (url.includes("/completion")) return "llamacpp";
  return "openai";
}

function inferEndpoint(base: string, protocol: Candidate["protocol"]) {
  if (/chat\/completions|api\/chat|completion$/i.test(base)) return base;
  if (protocol === "ollama") return base + "/api/chat";
  if (protocol === "llamacpp") return base + "/completion";
  return base + "/v1/chat/completions";
}

function modelsFor(role: BrainRole): string[] {
  const roleSpecific = role === "vision"
    ? splitList(process.env.LUNAVO_LOCAL_VISION_MODELS)
    : role === "critic"
      ? splitList(process.env.LUNAVO_LOCAL_CRITIC_MODELS)
      : role === "fast"
        ? splitList(process.env.LUNAVO_LOCAL_FAST_MODELS)
        : splitList(process.env.LUNAVO_LOCAL_REASONING_MODELS);
  if (roleSpecific.length) return roleSpecific;
  if (role === "vision") {
    const one = splitList(process.env.LUNAVO_LOCAL_VISION_MODEL);
    return one.length ? one : ["qwen2.5vl:32b"];
  }
  if (role === "fast") {
    const one = splitList(process.env.LUNAVO_LOCAL_FAST_MODEL);
    return one.length ? one : ["qwen3:14b"];
  }
  if (role === "critic") {
    const one = splitList(process.env.LUNAVO_LOCAL_CRITIC_MODEL);
    return one.length ? one : ["qwen3:32b"];
  }
  const one = splitList(process.env.LUNAVO_LOCAL_LLM_MODEL);
  return one.length ? one : ["qwen3:32b"];
}

function urlPool(role: BrainRole): string[] {
  const roleSpecific = role === "vision"
    ? splitList(process.env.LUNAVO_LOCAL_VISION_URLS)
    : role === "critic"
      ? splitList(process.env.LUNAVO_LOCAL_CRITIC_URLS)
      : role === "fast"
        ? splitList(process.env.LUNAVO_LOCAL_FAST_URLS)
        : splitList(process.env.LUNAVO_LOCAL_REASONING_URLS);
  if (roleSpecific.length) return roleSpecific.map(cleanUrl);
  return splitList(process.env.LUNAVO_LOCAL_LLM_URLS).map(cleanUrl).concat(
    process.env.LUNAVO_LOCAL_LLM_URL ? [cleanUrl(process.env.LUNAVO_LOCAL_LLM_URL)] : [],
  ).filter((v, i, a) => a.indexOf(v) === i);
}

function candidatesFor(role: BrainRole): Candidate[] {
  const urls = urlPool(role);
  const models = modelsFor(role);
  const effectiveUrls = urls.length
    ? urls
    : ["http://127.0.0.1:11434/v1/chat/completions"];
  const output: Candidate[] = [];
  for (let urlIndex = 0; urlIndex < effectiveUrls.length; urlIndex += 1) {
    const url = effectiveUrls[urlIndex]!;
    const protocol = inferProtocol(url);
    for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
      const model = models[modelIndex]!;
      output.push({
        baseUrl: inferEndpoint(url, protocol),
        model,
        protocol,
        weight: urlIndex === 0 && modelIndex === 0 ? 1.2 : 1,
      });
    }
  }
  return output.filter(
    (candidate, index, all) =>
      all.findIndex(
        (other) =>
          other.baseUrl === candidate.baseUrl &&
          other.model === candidate.model &&
          other.protocol === candidate.protocol,
      ) === index,
  );
}

function jsonInstruction(json: boolean | undefined) {
  return json ? "Return valid JSON only. Do not wrap the JSON in Markdown fences." : "";
}

function buildOllamaBody(candidate: Candidate, messages: BrainMessage[], options: BrainOptions) {
  return {
    model: candidate.model,
    messages,
    stream: false,
    options: {
      temperature: options.temperature ?? 0.2,
      num_predict: options.maxTokens ?? 4000,
    },
    ...(options.json ? { format: "json" } : {}),
  };
}

function buildOpenAiBody(candidate: Candidate, messages: BrainMessage[], options: BrainOptions) {
  return {
    model: candidate.model,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 4000,
    ...(options.json ? { response_format: { type: "json_object" } } : {}),
  };
}

function buildLlamaCppBody(candidate: Candidate, messages: BrainMessage[], options: BrainOptions) {
  const flattened = messages.map((m) => `[${m.role.toUpperCase()}]\n${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`).join("\n\n");
  return {
    prompt: flattened + "\n\n[ASSISTANT]\n",
    temperature: options.temperature ?? 0.2,
    n_predict: options.maxTokens ?? 4000,
    model: candidate.model,
  };
}

function extractContent(payload: any, protocol: Candidate["protocol"]): string {
  if (protocol === "ollama") return String(payload?.message?.content ?? "").trim();
  if (protocol === "llamacpp") return String(payload?.content ?? payload?.response ?? payload?.choices?.[0]?.text ?? "").trim();
  return String(payload?.choices?.[0]?.message?.content ?? payload?.choices?.[0]?.text ?? "").trim();
}

async function callCandidate(candidate: Candidate, messages: BrainMessage[], options: BrainOptions): Promise<CandidateResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);
  const started = Date.now();
  try {
    const body = candidate.protocol === "ollama"
      ? buildOllamaBody(candidate, messages, options)
      : candidate.protocol === "llamacpp"
        ? buildLlamaCppBody(candidate, messages, options)
        : buildOpenAiBody(candidate, messages, options);
    const response = await fetch(candidate.baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload?.error?.message ?? payload?.error ?? `Local model returned HTTP ${response.status}`));
    const content = extractContent(payload, candidate.protocol);
    if (!content) throw new Error("Local model returned an empty response");
    return { candidate, content, model: String(payload?.model ?? candidate.model), latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

function chooseBest(results: CandidateResult[]): CandidateResult {
  return [...results].sort((a, b) => (b.candidate.weight - a.candidate.weight) || (a.latencyMs - b.latencyMs))[0]!;
}

async function synthesizeEnsemble(results: CandidateResult[], original: BrainMessage[], options: BrainOptions): Promise<CandidateResult> {
  const critic = candidatesFor("critic")[0];
  if (!critic || results.length < 2) return chooseBest(results);
  const evidence = results.map((r, i) => `[Candidate ${i + 1} | ${r.model} | ${r.latencyMs}ms]\n${r.content}`).join("\n\n");
  const synthesisMessages: BrainMessage[] = [
    {
      role: "system",
      content: [
        "You are Lunavo's local AI judge and synthesizer.",
        "Compare candidate answers for factuality, instruction compliance, internal consistency and usefulness.",
        "Do not invent facts that are not supported by the candidate answers or original request.",
        "Prefer the answer that is most grounded and complete, not the most confident.",
        jsonInstruction(options.json),
      ].filter(Boolean).join("\n"),
    },
    { role: "user", content: `Original task:\n${JSON.stringify(original)}\n\nCandidate answers:\n${evidence}` },
  ];
  try {
    const judged = await callCandidate(critic, synthesisMessages, { ...options, ensemble: false, temperature: 0.1 });
    return judged;
  } catch {
    return chooseBest(results);
  }
}

export async function completeLocalBrain(messages: BrainMessage[], options: BrainOptions = {}) {
  const role = options.role ?? "reasoning";
  const candidates = candidatesFor(role);
  const limit = options.ensemble === false ? 1 : Math.min(candidates.length, Number(process.env.LUNAVO_LOCAL_BRAIN_FANOUT ?? 3));
  const selected = candidates.slice(0, Math.max(1, limit));
  const system = messages.find((m) => m.role === "system");
  const enhanced: BrainMessage[] = [
    ...(system ? [] : [{ role: "system", content: "You are Lunavo's self-hosted AI brain. Use evidence, obey the supplied task, state uncertainty, and never fabricate authoritative commerce facts." } satisfies BrainMessage]),
    ...(system && typeof system.content === "string" ? [{ ...system, content: `${system.content}\n\n${jsonInstruction(options.json)}` }] : system ? [system] : []),
    ...messages.filter((m) => m !== system),
  ];
  const settled = await Promise.allSettled(selected.map((candidate) => callCandidate(candidate, enhanced, options)));
  const results = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
  if (!results.length) {
    const errors = settled.flatMap((item) => item.status === "rejected" ? [item.reason instanceof Error ? item.reason.message : String(item.reason)] : []);
    throw new Error(`All self-hosted AI candidates failed: ${errors.slice(0, 3).join(" | ")}`);
  }
  const best = role === "critic" || results.length < 2 || options.ensemble === false
    ? chooseBest(results)
    : await synthesizeEnsemble(results, enhanced, options);
  return {
    model: best.model,
    content: best.content,
    role,
    candidatesTried: selected.length,
    successfulCandidates: results.length,
    latencyMs: best.latencyMs,
  };
}
