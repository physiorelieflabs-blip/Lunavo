import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const INTERVAL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 45_000;
let running = false;

type Research = {
  niche: string | null;
  executiveSummary: string;
  opportunities: Array<{ product: string; demand: string; competition: string; rationale: string }>;
  risks: string[];
  evidence: string[];
  generatedAt: string;
  provider: string;
};

function providerConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim());
}

function parseJson(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(cleaned) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("AI research returned an invalid structured result");
  return parsed as Record<string, unknown>;
}

function normalizeResearch(raw: Record<string, unknown>, niche: string | null, provider: string): Research {
  const opportunities = Array.isArray(raw.opportunities) ? raw.opportunities.slice(0, 20).map((item) => {
    const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      product: String(value.product ?? "").slice(0, 200),
      demand: String(value.demand ?? "").slice(0, 80),
      competition: String(value.competition ?? "").slice(0, 80),
      rationale: String(value.rationale ?? "").slice(0, 1000),
    };
  }).filter((item) => item.product && item.rationale) : [];
  const risks = Array.isArray(raw.risks) ? raw.risks.map(String).slice(0, 20) : [];
  const evidence = Array.isArray(raw.evidence) ? raw.evidence.map(String).slice(0, 30) : [];
  if (!String(raw.executiveSummary ?? "").trim() || opportunities.length === 0) throw new Error("AI research did not contain enough evidence-backed opportunities");
  return {
    niche,
    executiveSummary: String(raw.executiveSummary).slice(0, 4000),
    opportunities,
    risks,
    evidence,
    generatedAt: new Date().toISOString(),
    provider,
  };
}

async function callGemini(niche: string | null): Promise<Research> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("Gemini is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const prompt = `You are Lunavo's commerce research analyst. Research the requested store niche using current, verifiable market information where your tools allow it. Do not invent suppliers, prices, demand, competitors, sales, URLs, or statistics. Clearly distinguish observed evidence from inference. Return ONLY valid JSON with this shape: {"executiveSummary":"...","opportunities":[{"product":"...","demand":"high|medium|low|unknown","competition":"low|medium|high|unknown","rationale":"..."}],"risks":["..."],"evidence":["source or observation..."]}. Recommend only products with a defensible commercial rationale. Niche: ${niche || "choose a broadly viable commerce niche"}`;
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
      method: "POST", signal: controller.signal,
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }),
    });
    if (!response.ok) throw new Error(`Gemini research request failed (${response.status})`);
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!text) throw new Error("Gemini returned no research content");
    return normalizeResearch(parseJson(text), niche, "gemini");
  } finally { clearTimeout(timer); }
}

async function callDeepSeek(niche: string | null): Promise<Research> {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) throw new Error("DeepSeek is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const prompt = `You are Lunavo's commerce research analyst. Use only information you can responsibly support from your model knowledge. Do not claim live web research, current prices, supplier availability, demand statistics or competitor facts unless you can support them. Clearly label uncertainty. Return ONLY valid JSON with this shape: {"executiveSummary":"...","opportunities":[{"product":"...","demand":"high|medium|low|unknown","competition":"low|medium|high|unknown","rationale":"..."}],"risks":["..."],"evidence":["basis or limitation..."]}. Niche: ${niche || "choose a broadly viable commerce niche"}`;
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST", signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash", temperature: 0.2, messages: [{ role: "system", content: "You produce structured, non-fabricated commerce research." }, { role: "user", content: prompt }], response_format: { type: "json_object" } }),
    });
    if (!response.ok) throw new Error(`DeepSeek research request failed (${response.status})`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("DeepSeek returned no research content");
    return normalizeResearch(parseJson(text), niche, "deepseek");
  } finally { clearTimeout(timer); }
}

async function executeResearch(niche: string | null) {
  if (process.env.GEMINI_API_KEY?.trim()) return callGemini(niche);
  return callDeepSeek(niche);
}

/** Durable worker for master-admin AI stores. Research is performed by an explicitly
 * configured provider and persisted with evidence. No credentials or invented market
 * facts are written to the database. Store construction remains a separate verified step. */
export async function runAdminAiStoreWorker() {
  if (running) return;
  running = true;
  try {
    const jobs = await db.execute(sql`SELECT id,niche,status FROM admin_ai_store_jobs WHERE status IN ('queued','researching','building') ORDER BY created_at ASC LIMIT 5`);
    for (const job of jobs.rows as Array<{ id:number; niche:string|null; status:string }>) {
      try {
        if (!providerConfigured()) {
          await db.execute(sql`UPDATE admin_ai_store_jobs SET status='failed',error_message='No configured AI research provider is available. Configure Gemini or DeepSeek securely before this job can execute.',updated_at=now() WHERE id=${job.id} AND status IN ('queued','researching')`);
          continue;
        }
        if (job.status === "queued") {
          await db.execute(sql`UPDATE admin_ai_store_jobs SET status='researching',research=jsonb_build_object('state','research_started','niche',${job.niche}),updated_at=now() WHERE id=${job.id} AND status='queued'`);
          continue;
        }
        if (job.status === "researching") {
          const research = await executeResearch(job.niche);
          await db.execute(sql`UPDATE admin_ai_store_jobs SET status='ready_for_review',research=${JSON.stringify(research)}::jsonb,build_plan=${JSON.stringify({ state: "research_complete", evidenceBacked: true, requiresVerifiedSupplierAndStoreData: true })}::jsonb,error_message=NULL,updated_at=now() WHERE id=${job.id} AND status='researching'`);
          continue;
        }
        await db.execute(sql`UPDATE admin_ai_store_jobs SET status='ready_for_review',build_plan=jsonb_build_object('state','awaiting_verified_build_inputs','evidenceBacked',true),updated_at=now() WHERE id=${job.id} AND status='building'`);
      } catch (error) {
        await db.execute(sql`UPDATE admin_ai_store_jobs SET status='failed',error_message=${String(error instanceof Error ? error.message : 'AI store worker failed').slice(0,2000)},updated_at=now() WHERE id=${job.id} AND status IN ('queued','researching','building')`);
      }
    }
  } finally { running = false; }
}

export function startAdminAiStoreWorker() {
  void runAdminAiStoreWorker();
  const timer = setInterval(() => void runAdminAiStoreWorker(), INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
