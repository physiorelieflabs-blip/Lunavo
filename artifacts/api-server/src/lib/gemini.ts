type GeminiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GeminiPart = {
  text?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  error?: {
    message?: string;
  };
};

const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL?.trim() || "gemini-3.8-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function geminiKey(): string {
  const key = process.env.LUNAVO_GEMINI_API_KEY?.trim();
  if (!key) throw new Error("LUNAVO_GEMINI_API_KEY is not configured");
  return key;
}

async function generateContent(
  model: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<GeminiResponse> {
  const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(geminiKey())}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = (await response.json().catch(() => ({}))) as GeminiResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `Gemini returned HTTP ${response.status}`);
  }
  return payload;
}

export async function enhanceImagePrompt(
  prompt: string,
  context: {
    storeName: string;
    storeDescription?: string | null;
    currency: string;
    products?: Array<{ title: string; category?: string | null; description?: string | null }>;
  },
): Promise<string> {
  const productContext = (context.products ?? []).slice(0, 30)
    .map((p) => `- ${p.title} | ${p.category ?? "general"} | ${p.description ?? ""}`)
    .join("\n");

  const response = await completeGeminiChat([
    {
      role: "system",
      content: [
        "You are the TS Commerce Visual Director.",
        "Turn a merchant's rough image idea into one highly specific production-ready image prompt.",
        "Optimize for ecommerce storefronts, product photography, hero banners, campaign creatives, editorial lifestyle scenes, or polished UI/brand visuals as appropriate.",
        "Preserve the merchant's requested subject and intent. Improve composition, camera/lens language, lighting, materials, color harmony, realistic proportions, background, negative space, and commercial polish.",
        "Do not invent factual product specifications, brand claims, prices, discounts, certifications, people, logos, or text that the merchant did not provide.",
        "Do not add watermarks or fake logos. Do not claim an image contains exact text unless the merchant explicitly requested that text.",
        "Return only the final image-generation prompt, with no preamble.",
        `Store: ${context.storeName}`,
        `Store description: ${context.storeDescription ?? "Not provided"}`,
        `Billing/display currency: ${context.currency}`,
        productContext ? `Relevant catalog context:\n${productContext}` : "No catalog context supplied.",
      ].join("\n"),
    },
    { role: "user", content: prompt },
  ]);
  return response.content.trim() || prompt;
}

export async function completeGeminiChat(messages: GeminiMessage[]): Promise<{
  model: string;
  content: string;
}> {
  const systemMessages = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
  const payload = await generateContent(GEMINI_CHAT_MODEL, {
    ...(systemMessages ? { systemInstruction: { parts: [{ text: systemMessages }] } } : {}),
    contents,
    generationConfig: { maxOutputTokens: 1200 },
  }, 45_000);
  const content = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
  if (!content) throw new Error("Gemini returned an empty response");
  return { model: GEMINI_CHAT_MODEL, content };
}

type GroundedResearchResult = {
  model: string;
  summary: string;
  sources: Array<{ title: string; url: string; snippet: string }>;
};

type GeminiInteractionResponse = {
  model?: string;
  steps?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{
        type?: string;
        url?: string;
        title?: string;
        start_index?: number;
        end_index?: number;
      }>;
    }>;
  }>;
};

export async function researchWithGemini(query: string): Promise<GroundedResearchResult> {
  const model = process.env.GEMINI_RESEARCH_MODEL?.trim() || "gemini-3.8-flash";
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": geminiKey(),
    },
    body: JSON.stringify({
      model,
      input: [
        "You are Lunavo's research analyst.",
        "Research the user's query using the web-search tool.",
        "Give a concise factual synthesis grounded in current public sources.",
        "Do not invent claims, prices, availability, product specifications, legal conclusions, or business facts.",
        "Clearly distinguish sourced facts from uncertainty.",
        "Query: " + query,
      ].join("\n"),
      tools: [{ type: "google_search" }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = (await response.json().catch(() => ({}))) as GeminiInteractionResponse & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "Gemini research returned HTTP " + response.status);

  const sources = new Map<string, { title: string; url: string; snippet: string }>();
  const outputParts: string[] = [];
  for (const step of payload.steps ?? []) {
    if (step.type !== "model_output" || !Array.isArray(step.content)) continue;
    for (const block of step.content) {
      if (block.type !== "text" || !block.text) continue;
      outputParts.push(block.text);
      for (const annotation of block.annotations ?? []) {
        if (annotation.type !== "url_citation" || typeof annotation.url !== "string" || !/^https?:\/\//i.test(annotation.url)) continue;
        const start = Number(annotation.start_index ?? 0);
        const end = Number(annotation.end_index ?? block.text.length);
        const snippet = start >= 0 && end <= block.text.length && start <= end ? block.text.slice(start, end).trim() : block.text.trim();
        if (!sources.has(annotation.url)) {
          sources.set(annotation.url, {
            title: typeof annotation.title === "string" && annotation.title.trim() ? annotation.title.trim().slice(0, 200) : new URL(annotation.url).hostname,
            url: annotation.url,
            snippet: snippet.slice(0, 1000),
          });
        }
      }
    }
  }
  const summary = outputParts.join("\n\n").trim();
  if (!summary) throw new Error("Gemini research returned no grounded answer");
  return {
    model: payload.model || model,
    summary,
    sources: [...sources.values()].slice(0, 12),
  };
}
