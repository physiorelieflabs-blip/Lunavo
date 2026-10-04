import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { completeLocalChat, selfHostedAiConfigured } from "../lib/self-hosted-ai";

const INTERVAL_MS = 30_000;
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

function parseJson(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/i, "");
  const parsed = JSON.parse(cleaned) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("AI research returned an invalid structured result");
  return parsed as Record<string, unknown>;
}

function normalizeResearch(raw: Record<string, unknown>, niche: string | null): Research {
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
  return { niche, executiveSummary: String(raw.executiveSummary).slice(0, 4000), opportunities, risks, evidence, generatedAt: new Date().toISOString(), provider: "self-hosted-local" };
}

async function executeResearch(niche: string | null) {
  if (!selfHostedAiConfigured()) throw new Error("Self-hosted AI is not configured. Set LUNAVO_LOCAL_LLM_URL.");
  const prompt = `Return ONLY valid JSON with this shape: {"executiveSummary":"...","opportunities":[{"product":"...","demand":"high|medium|low|unknown","competition":"low|medium|high|unknown","rationale":"..."}],"risks":["..."],"evidence":["..."]}. You are Lunavo's self-hosted commerce research analyst. Niche: ${niche || "choose a viable commerce niche"}. Never claim live web research, current supplier availability, prices, competitor statistics, URLs, certifications, demand numbers or live market facts unless verified evidence was supplied. Clearly label uncertainty.`;
  const response = await completeLocalChat([
    { role: "system", content: "Produce structured, non-fabricating commerce research. Return JSON only." },
    { role: "user", content: prompt },
  ], { json: true, maxTokens: 4000, temperature: 0.2, timeoutMs: 45_000 });
  return normalizeResearch(parseJson(response.content), niche);
}

export async function runAdminAiStoreWorker() {
  if (running) return;
  running = true;
  try {
    const jobs = await db.execute(sql`SELECT id,niche,status FROM admin_ai_store_jobs WHERE status IN ('queued','researching','building') ORDER BY created_at ASC LIMIT 5`);
    for (const job of jobs.rows as Array<{ id:number; niche:string|null; status:string }>) {
      try {
        if (job.status === "queued") {
          await db.execute(sql`UPDATE admin_ai_store_jobs SET status='researching',research=jsonb_build_object('state','research_started','provider','self-hosted-local'),updated_at=now() WHERE id=${job.id} AND status='queued'`);
          continue;
        }
        if (job.status === "researching") {
          const research = await executeResearch(job.niche);
          await db.execute(sql`UPDATE admin_ai_store_jobs SET status='ready_for_review',research=${JSON.stringify(research)}::jsonb,build_plan=${JSON.stringify({ state: "research_complete", selfHostedInference: true, requiresVerifiedInputs: true, noFakeData: true })}::jsonb,error_message=NULL,updated_at=now() WHERE id=${job.id} AND status='researching'`);
          continue;
        }
        await db.execute(sql`UPDATE admin_ai_store_jobs SET status='ready_for_review',build_plan=jsonb_build_object('state','awaiting_verified_build_inputs','selfHostedInference',true,'noFakeData',true),updated_at=now() WHERE id=${job.id} AND status='building'`);
      } catch(error) {
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
