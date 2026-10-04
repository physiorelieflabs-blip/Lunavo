import { isIP } from "node:net";
import { completePrimaryReasoning } from "./ai-provider";

export type LocalSearchResult = { title: string; url: string; snippet: string };

function privateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) return true;
  const version = isIP(host);
  if (version === 4) {
    const parts = host.split(".").map(Number);
    const [a,b] = parts;
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (version === 6) return host === "::1" || /^f[cd]/i.test(host) || /^fe80:/i.test(host);
  return false;
}

function endpoint(): string {
  const configured = process.env.LUNAVO_LOCAL_SEARCH_URL?.trim();
  if (!configured) throw new Error("LUNAVO_LOCAL_SEARCH_URL is not configured; self-hosted search is unavailable");
  let url: URL;
  try { url = new URL(configured); } catch { throw new Error("LUNAVO_LOCAL_SEARCH_URL must be a valid HTTP(S) URL"); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("LUNAVO_LOCAL_SEARCH_URL must use HTTP or HTTPS");
  if (!privateHost(url.hostname)) throw new Error("LUNAVO_LOCAL_SEARCH_URL must point to a private/local self-hosted search server");
  return url.toString();
}

type SearxResponse = { results?: Array<{ title?: unknown; url?: unknown; content?: unknown }>; error?: string };

export async function localSearch(query: string, limit = 6): Promise<LocalSearchResult[]> {
  const base = new URL(endpoint());
  base.searchParams.set("q", query.trim().slice(0, 500));
  base.searchParams.set("format", "json");
  base.searchParams.set("language", "en-US");
  const response = await fetch(base, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  const payload = (await response.json().catch(() => ({}))) as SearxResponse;
  if (!response.ok) throw new Error(payload.error || `Local search server returned HTTP ${response.status}`);
  const results: LocalSearchResult[] = [];
  for (const item of payload.results ?? []) {
    if (typeof item.title !== "string" || typeof item.url !== "string" || !/^https?:\/\//i.test(item.url)) continue;
    results.push({ title: item.title.slice(0, 500), url: item.url.slice(0, 4000), snippet: typeof item.content === "string" ? item.content.slice(0, 1200) : "" });
    if (results.length >= limit) break;
  }
  return results;
}

export async function researchWithLocalSearch(query: string): Promise<{ summary: string; sources: LocalSearchResult[] }> {
  const sources = await localSearch(query, 6);
  if (!sources.length) return { summary: `No local search results were returned for “${query}”. Try a more specific query.`, sources: [] };
  const evidence = sources.map((s, i) => `SOURCE ${i + 1}\nTITLE: ${s.title}\nURL: ${s.url}\nSNIPPET: ${s.snippet}`).join("\n\n");
  const ai = await completePrimaryReasoning([
    {
      role: "system",
      content: "You are Lunavo's research synthesizer. Use only the supplied local-search evidence. Never invent facts, citations, prices, demand, supplier status, market sizes or dates. Preserve uncertainty. Return one concise paragraph with no links other than those in the supplied evidence.",
    },
    { role: "user", content: `Question: ${query}\n\nEvidence:\n${evidence}` },
  ], { maxTokens: 700, reasoningEffort: "high", role: "critic" });
  return { summary: ai.content.trim(), sources };
}
