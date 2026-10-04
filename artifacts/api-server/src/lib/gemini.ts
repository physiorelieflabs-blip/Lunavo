import { completeLocalChat } from "./self-hosted-ai";

type GeminiMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Compatibility boundary retained for older Lunavo callers.
 * The implementation is local/self-hosted; it never calls the Gemini API.
 */
export async function completeGeminiChat(
  messages: GeminiMessage[],
): Promise<{ model: string; content: string }> {
  return completeLocalChat(messages, { profile: "general", maxTokens: 3000 });
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
  const productContext = (context.products ?? [])
    .slice(0, 30)
    .map((p) => "- " + p.title + " | " + (p.category ?? "general") + " | " + (p.description ?? ""))
    .join("\n");
  const response = await completeLocalChat([
    {
      role: "system",
      content: "You are Lunavo's self-hosted Visual Director. Improve the merchant's image brief without inventing product facts, claims, prices, certifications, people, logos or text. Return only the final image prompt.",
    },
    {
      role: "user",
      content: [
        prompt,
        "Store: " + context.storeName,
        "Store description: " + (context.storeDescription ?? "Not provided"),
        "Currency: " + context.currency,
        productContext ? "Catalog:\n" + productContext : "No catalog context.",
      ].join("\n"),
    },
  ], { profile: "general", maxTokens: 1600 });
  return response.content.trim() || prompt;
}

export async function researchWithGemini(
  query: string,
): Promise<{ model: string; summary: string; sources: Array<{ title: string; url: string; snippet: string }> }> {
  const response = await completeLocalChat([
    {
      role: "system",
      content: [
        "You are Lunavo's self-hosted research analyst.",
        "Do not claim live web research unless source material is supplied.",
        "State uncertainty and provide no fabricated URLs or citations.",
        "Distinguish evidence, inference, and unknowns.",
      ].join(" "),
    },
    { role: "user", content: query },
  ], { profile: "reasoning", maxTokens: 2600, reasoningEffort: "high" });
  return { model: response.model, summary: response.content, sources: [] };
}
