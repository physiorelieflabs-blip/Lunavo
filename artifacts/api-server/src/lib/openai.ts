type OpenAiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

type ImageGenerationResponse = {
  data?: Array<{
    b64_json?: string;
  }>;
  error?: {
    message?: string;
  };
};

const OPENAI_CHAT_MODEL = "gpt-5.4-mini";
const OPENAI_IMAGE_MODEL = "gpt-image-1";

function openAiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  return key;
}

export async function completeOpenAiChat(messages: OpenAiMessage[]): Promise<{
  model: string;
  content: string;
}> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${openAiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_CHAT_MODEL,
      messages,
      max_completion_tokens: 1200,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI returned HTTP ${response.status}`);
  }
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI returned an empty response");
  return { model: OPENAI_CHAT_MODEL, content };
}

export async function generateOpenAiImage(prompt: string): Promise<{
  model: string;
  mimeType: "image/png";
  data: string;
  bytes: Buffer;
}> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${openAiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt,
      size: "1024x1024",
      quality: "medium",
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = (await response.json().catch(() => ({}))) as ImageGenerationResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI returned HTTP ${response.status}`);
  }
  const encoded = payload.data?.[0]?.b64_json;
  if (!encoded) throw new Error("OpenAI returned no image data");
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length) throw new Error("OpenAI returned an empty image");
  return { model: OPENAI_IMAGE_MODEL, mimeType: "image/png", data: `data:image/png;base64,${encoded}`, bytes };
}