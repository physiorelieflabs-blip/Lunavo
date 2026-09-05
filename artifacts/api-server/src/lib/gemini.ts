type GeminiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GeminiPart = {
  text?: string;
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
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

const GEMINI_CHAT_MODEL = "gemini-3.6-flash";
const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
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

export async function generateGeminiImage(prompt: string): Promise<{
  model: string;
  mimeType: string;
  data: string;
  bytes: Buffer;
}> {
  const payload = await generateContent(GEMINI_IMAGE_MODEL, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"] },
  }, 120_000);
  const imagePart = payload.candidates?.[0]?.content?.parts?.find(
    (part) => part.inlineData?.data,
  );
  const encoded = imagePart?.inlineData?.data;
  const mimeType = imagePart?.inlineData?.mimeType || "image/png";
  if (!encoded) throw new Error("Gemini returned no image data");
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length) throw new Error("Gemini returned an empty image");
  return {
    model: GEMINI_IMAGE_MODEL,
    mimeType,
    data: `data:${mimeType};base64,${encoded}`,
    bytes,
  };
}