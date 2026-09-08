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
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
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