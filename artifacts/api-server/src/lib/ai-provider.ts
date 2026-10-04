import { completeLocalChat } from "./self-hosted-ai";

type ReasoningMessage = { role: "system" | "user" | "assistant"; content: string };

export async function completePrimaryReasoning(
  messages: ReasoningMessage[],
  options: { json?: boolean; maxTokens?: number; reasoningEffort?: "low" | "high" | "max" } = {},
): Promise<{ model: string; content: string }> {
  return completeLocalChat(messages, {
    json: options.json,
    maxTokens: options.maxTokens,
    temperature: options.reasoningEffort === "max" ? 0.1 : options.reasoningEffort === "low" ? 0.3 : 0.2,
  });
}