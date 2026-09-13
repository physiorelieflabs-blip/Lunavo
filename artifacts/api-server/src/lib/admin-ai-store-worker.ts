import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const INTERVAL_MS=30_000;
const GEMINI_MODEL=process.env.GEMINI_MODEL?.trim()||"gemini-2.5-flash";
const DEEPSEEK_MODEL=process.env.DEEPSEEK_MODEL?.trim()||"deepseek-v4-pro";
let running=false;

type ResearchResult={
  executiveSummary:string;
  targetCustomer:string;
  productOpportunities:Array<{name:string;reason:string;demandSignal:string;competitionSignal:string;risks:string[]}>;
  competitorSignals:string[];
  supplierResearch:string[];
  pricingGuidance:string[];
  launchPlan:string[];
  risks:string[];
  sources:Array<{title:string;url:string}>;
};

function providerConfigured(){return Boolean(process.env.GEMINI_API_KEY?.trim()||process.env.DEEPSEEK_API_KEY?.trim());}

function parseJson(text:string):ResearchResult{
  const cleaned=text.trim().replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
  const value=JSON.parse(cleaned) as Partial<ResearchResult>;
  if(typeof value.executiveSummary!=="string"||typeof value.targetCustomer!=="string"||!Array.isArray(value.productOpportunities)||!Array.isArray(value.competitorSignals)||!Array.isArray(value.supplierResearch)||!Array.isArray(value.pricingGuidance)||!Array.isArray(value.launchPlan)||!Array.isArray(value.risks)||!Array.isArray(value.sources)) throw new Error("AI research response failed schema validation");
  return value as ResearchResult;
}

async function geminiResearch(niche:string|null):Promise<ResearchResult>{
  const key=process.env.GEMINI_API_KEY?.trim();
  if(!key) throw new Error("Gemini is not configured");
  const prompt=`Research a new global commerce store for Lunavo. Niche: ${niche||"choose the strongest current opportunity"}. Use current web evidence. Return ONLY valid JSON with exactly these fields: executiveSummary, targetCustomer, productOpportunities (array of objects with name, reason, demandSignal, competitionSignal, risks array), competitorSignals array, supplierResearch array, pricingGuidance array, launchPlan array, risks array, sources (array of title,url). Do not invent suppliers, prices, demand, competitors, URLs or statistics. If evidence is unavailable, say so explicitly. Prefer opportunities with high demand, defensible differentiation, manageable supplier risk and healthy margins. This research will be used as a planning artifact, not as proof of financial performance.`;
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(key)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],tools:[{google_search:{}}],generationConfig:{responseMimeType:"application/json",temperature:0.2}})});
  const payload=await response.json() as any;
  if(!response.ok) throw new Error(`Gemini research failed: ${String(payload?.error?.message||response.status).slice(0,500)}`);
  const text=payload?.candidates?.[0]?.content?.parts?.map((part:any)=>typeof part?.text==="string"?part.text:"").join("").trim();
  if(!text) throw new Error("Gemini returned no research content");
  return parseJson(text);
}

async function deepSeekResearch(niche:string|null):Promise<ResearchResult>{
  const key=process.env.DEEPSEEK_API_KEY?.trim();
  if(!key) throw new Error("DeepSeek is not configured");
  const prompt=`Produce a JSON commerce opportunity research plan for Lunavo. Niche: ${niche||"choose a promising current opportunity"}. You do not have browsing access in this call, so do not claim live web research or invent current facts. Return only JSON with executiveSummary, targetCustomer, productOpportunities (name,reason,demandSignal,competitionSignal,risks[]), competitorSignals[], supplierResearch[], pricingGuidance[], launchPlan[], risks[], sources[]. Mark evidence that requires live research explicitly.`;
  const response=await fetch("https://api.deepseek.com/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({model:DEEPSEEK_MODEL,messages:[{role:"system",content:"You are Lunavo's commerce research planner. Never fabricate evidence."},{role:"user",content:prompt}],thinking:{type:"enabled"},reasoning_effort:"high",response_format:{type:"json_object"},stream:false,max_tokens:5000})});
  const payload=await response.json() as any;
  if(!response.ok) throw new Error(`DeepSeek research failed: ${String(payload?.error?.message||response.status).slice(0,500)}`);
  const text=payload?.choices?.[0]?.message?.content;
  if(typeof text!=="string"||!text.trim()) throw new Error("DeepSeek returned no research content");
  return parseJson(text);
}

async function executeResearch(niche:string|null){
  if(process.env.GEMINI_API_KEY?.trim()) return geminiResearch(niche);
  return deepSeekResearch(niche);
}

export async function runAdminAiStoreWorker(){
 if(running)return; running=true;
 try{
  const jobs=await db.execute(sql`SELECT id,niche,status FROM admin_ai_store_jobs WHERE status IN ('queued','researching') ORDER BY created_at ASC LIMIT 5`);
  for(const job of jobs.rows as Array<{id:number;niche:string|null;status:string}>){
   try{
    if(!providerConfigured()){await db.execute(sql`UPDATE admin_ai_store_jobs SET status='failed',error_message='No configured AI research provider is available. Configure Gemini or DeepSeek securely before this job can execute.',updated_at=now() WHERE id=${job.id} AND status IN ('queued','researching')`);continue;}
    await db.execute(sql`UPDATE admin_ai_store_jobs SET status='researching',updated_at=now() WHERE id=${job.id} AND status='queued'`);
    const research=await executeResearch(job.niche);
    const buildPlan={state:"research_complete",requiresVerifiedInputs:true,noFakeData:true,productSelection:research.productOpportunities.slice(0,20),launchPlan:research.launchPlan,pricingGuidance:research.pricingGuidance,nextSteps:["Validate supplier availability and landed costs","Create store draft from approved research","Require real external authorization before social publishing or paid advertising"]};
    await db.execute(sql`UPDATE admin_ai_store_jobs SET status='ready_for_review',research=${JSON.stringify(research)}::jsonb,build_plan=${JSON.stringify(buildPlan)}::jsonb,error_message=NULL,updated_at=now() WHERE id=${job.id} AND status='researching'`);
   }catch(error){await db.execute(sql`UPDATE admin_ai_store_jobs SET status='failed',error_message=${String(error instanceof Error?error.message:'AI store worker failed').slice(0,2000)},updated_at=now() WHERE id=${job.id} AND status IN ('queued','researching')`);}
  }
 }finally{running=false;}
}
export function startAdminAiStoreWorker(){void runAdminAiStoreWorker();const timer=setInterval(()=>void runAdminAiStoreWorker(),INTERVAL_MS);timer.unref?.();return()=>clearInterval(timer);}
