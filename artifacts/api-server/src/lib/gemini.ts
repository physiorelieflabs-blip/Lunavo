import { completeDeepSeekChat } from "./deepseek";

type GeminiMessage = { role: "system" | "user" | "assistant"; content: string };

export async function enhanceImagePrompt(
  prompt: string,
  context: { storeName: string; storeDescription?: string | null; currency: string; products?: Array<{ title: string; category?: string | null; description?: string | null }> },
): Promise<string> {
  const productContext = (context.products ?? []).slice(0, 30).map((p) => `- ${p.title} | ${p.category ?? "general"} | ${p.description ?? ""}`).join("\n");
  const response = await completeGeminiChat([
    { role: "system", content: [
      "You are Lunavo's self-hosted Visual Director.",
      "Turn a merchant's rough image idea into one production-ready image prompt.",
      "Preserve factual product information and never invent specifications, prices, discounts, certifications, logos, people or claims.",
      "Improve composition, lighting, camera language, materials, background, negative space and commercial polish.",
      "Return only the final image-generation prompt.",
      `Store: ${context.storeName}`,
      `Store description: ${context.storeDescription ?? "Not provided"}`,
      `Currency: ${context.currency}`,
      productContext ? `Catalog context:\n${productContext}` : "No catalog context supplied.",
    ].join("\n") },
    { role: "user", content: prompt },
  ]);
  return response.content.trim() || prompt;
}

export async function completeGeminiChat(messages: GeminiMessage[]): Promise<{ model: string; content: string }> {
  return completeDeepSeekChat(messages, { maxTokens: 4000 });
}

type GroundedResearchResult = {
  model: string;
  summary: string;
  sources: Array<{ title: string; url: string; snippet: string }>;
};

export async function researchWithGemini(query: string): Promise<GroundedResearchResult> {
  const searchBase = (process.env.LUNAVO_LOCAL_SEARCH_URL?.trim() || "http://127.0.0.1:8080/search").replace(/\\/$/, "");
  const url = new URL(searchBase);
  url.searchParams.set("q", query.slice(0, 2000));
  url.searchParams.set("format", "json");
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Self-hosted search returned HTTP ${response.status}`);
  const payload = (await response.json().catch(() => ({}))) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  const sources = (payload.results ?? [])
    .filter((r) => typeof r.url === "string" && /^https?:\\/\\//i.test(r.url))
    .slice(0, 12)
    .map((r) => ({ title: String(r.title || new URL(r.url!).hostname).slice(0, 200), url: r.url!, snippet: String(r.content || "").slice(0, 1000) }));
  if (!sources.length) throw new Error("Self-hosted search returned no usable sources");
  const evidence = sources.map((s, i) => `[Source ${i + 1}] ${s.title}\nURL: ${s.url}\nEvidence: ${s.snippet}`).join("\n\n");
  const answer = await completeGeminiChat([
    { role: "system", content: "You are Lunavo's self-hosted research analyst. Synthesize only from the supplied evidence. Clearly separate facts from uncertainty. Never invent prices, availability, specifications or claims. Cite sources inline as [Source N]." },
    { role: "user", content: `Query: ${query}\n\nEvidence:\n${evidence}` },
  ]);
  return { model: answer.model, summary: answer.content, sources };
}
