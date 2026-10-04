import { completeLocalChat, completeLocalEnsemble, type LocalAiProfile } from "./self-hosted-ai";

type ReasoningMessage = { role: "system" | "user" | "assistant"; content: string };

export async function completePrimaryReasoning(
  messages: ReasoningMessage[],
  options: {
    json?: boolean;
    maxTokens?: number;
    reasoningEffort?: "low" | "high" | "max";
  } = {},
): Promise<{ model: string; content: string }> {
  if (options.reasoningEffort === "max") {
    const ensemble = await completeLocalEnsemble(messages, {
      profiles: ["reasoning", "general", "review"] satisfies LocalAiProfile[],
      json: options.json,
      maxTokens: options.maxTokens,
    });
    return { model: ensemble.model, content: ensemble.content };
  }

  return completeLocalChat(messages, {
    profile: "reasoning",
    json: options.json,
    maxTokens: options.maxTokens,
    reasoningEffort: options.reasoningEffort ?? "high",
  });
}
