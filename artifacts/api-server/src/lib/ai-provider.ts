import { completeDeepSeekChat, deepSeekConfigured } from "./deepseek";
import { completeGeminiChat } from "./gemini";

type ReasoningMessage = { role: "system" | "user" | "assistant"; content: string };

export async function completePrimaryReasoning(
  messages: ReasoningMessage[],
  options: { json?: boolean; maxTokens?: number; reasoningEffort?: "low" | "high" | "max" } = {},
): Promise<{ model: string; content: string }> {
  if (deepSeekConfigured()) {
    return completeDeepSeekChat(messages, options);
  }
  return completeGeminiChat(messages);
}
