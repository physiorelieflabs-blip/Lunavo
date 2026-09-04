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

const OPENAI_CHAT_MODEL = "gpt-5.4-mini";

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