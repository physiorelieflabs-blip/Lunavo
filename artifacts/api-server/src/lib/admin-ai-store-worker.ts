import { randomUUID } from "node:crypto";
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

async function geminiGenerate(key:string,contents:unknown,config:Record<string,unknown>){
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({contents,...config})});
  const payload=await response.json() as any;
  if(!response.ok) throw new Error(`Gemini research failed: ${String(payload?.error?.message||response.status).slice(0,500)}`);
  return payload;
}

async function geminiResearch(niche:string|null):Promise<ResearchResult>{
  const key=process.env.GEMINI_API_KEY?.trim();
  if(!key) throw new Error("Gemini is not configured");
  const researchPrompt=`Research a new global commerce store for Lunavo. Niche: ${niche||"choose the strongest current opportunity"}. Search the web for current demand, competition, supplier and pricing evidence. Be explicit about uncertainty. Do not invent suppliers, prices, demand, competitors, URLs or statistics. Return a concise research memo with product opportunities, competitor signals, supplier evidence, pricing observations, risks and launch recommendations.`;
  const grounded=await geminiGenerate(key,[{role:"user",parts:[{text:researchPrompt}]}],{tools:[{google_search:{}}],generationConfig:{temperature:0.2}});
  const groundedText=grounded?.candidates?.[0]?.content?.parts?.map((part:any)=>typeof part?.text==="string"?part.text:"").join("").trim();
  if(!groundedText) throw new Error("Gemini returned no grounded research content");
  const chunks=Array.isArray(grounded?.candidates?.[0]?.groundingMetadata?.groundingChunks)?grounded.candidates[0].groundingMetadata.groundingChunks:[];
  const groundedSources=chunks.map((chunk:any)=>chunk?.web).filter((web:any)=>web&&typeof web.uri==="string").map((web:any)=>({title:typeof web.title==="string"?web.title:"Web source",url:web.uri}));
  const structurePrompt=`Convert the following grounded research memo into ONLY valid JSON with exactly these fields: executiveSummary, targetCustomer, productOpportunities (array of objects with name, reason, demandSignal, competitionSignal, risks array), competitorSignals array, supplierResearch array, pricingGuidance array, launchPlan array, risks array, sources array of title,url. Preserve uncertainty and do not add facts absent from the memo. Include the supplied sources where relevant. MEMO:\n${groundedText}\nSOURCES:\n${JSON.stringify(groundedSources)}`;
  const structured=await geminiGenerate(key,[{role:"user",parts:[{text:structurePrompt}]}],{generationConfig:{responseMimeType:"application/json",temperature:0}});
  const structuredText=structured?.candidates?.[0]?.content?.parts?.map((part:any)=>typeof part?.text==="string"?part.text:"").join("").trim();
  if(!structuredText) throw new Error("Gemini returned no structured research content");
  const parsed=parseJson(structuredText);
  parsed.sources=[...parsed.sources,...groundedSources].filter((source,index,array)=>source?.url&&array.findIndex(item=>item.url===source.url)===index);
  return parsed;
}

async function deepSeekResearch(niche:string|null):Promise<ResearchResult>{
  const key=process.env.DEEPSEEK_API_KEY?.trim();
  if(!key) throw new Error("DeepSeek is not configured");
  const prompt=`Produce a JSON commerce opportunity research plan for Lunavo. Niche: ${niche||"choose a promising opportunity"}. You do not have browsing access in this call, so do not claim live web research or invent current facts. Return only JSON with executiveSummary, targetCustomer, productOpportunities (name,reason,demandSignal,competitionSignal,risks[]), competitorSignals[], supplierResearch[], pricingGuidance[], launchPlan[], risks[], sources[]. Mark evidence that requires live research explicitly. Include the word JSON in your response.`;
  const response=await fetch("https://api.deepseek.com/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({model:DEEPSEEK_MODEL,messages:[{role:"system",content:"You are Lunavo's commerce research planner. Never fabricate evidence. Output JSON."},{role:"user",content:prompt}],thinking:{type:"enabled"},reasoning_effort:"high",response_format:{type:"json_object"},stream:false,max_tokens:5000})});
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

function slugify(value:string){
  const slug=value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,70);
  return slug||`lunavo-store-${Date.now()}`;
}

function safeText(value:string,max=500){return value.replace(/\s+/g," ").trim().slice(0,max);}

async function buildStoreDraft(jobId:number,requestedBy:string,niche:string|null,research:ResearchResult){
  const merchant=await db.execute(sql`SELECT id,store_name FROM merchants WHERE clerk_user_id=${requestedBy} LIMIT 1`);
  const owner=(merchant.rows as Array<{id:number;store_name:string}>)[0];
  if(!owner) throw new Error("The master-admin identity is not attached to a merchant workspace; AI store creation cannot create an ownerless store");

  const leadName=safeText(niche||research.productOpportunities[0]?.name||"AI Commerce Store",120);
  const baseSlug=slugify(leadName);
  const publicKey=`lunavo_${randomUUID().replace(/-/g,"")}`;
  const theme={accentColor:"#7c3aed",backgroundColor:"#fafafa",textColor:"#111827",layout:"editorial",announcement:"AI-built store draft — review before publishing.",logoUrl:null,heroImageUrl:null};
  const opportunities=research.productOpportunities.slice(0,12).map((item)=>({name:safeText(item.name,120),reason:safeText(item.reason),demandSignal:safeText(item.demandSignal),competitionSignal:safeText(item.competitionSignal),risks:item.risks.map((risk)=>safeText(risk,180)).slice(0,5)}));
  const sections=[
    {id:"hero",type:"hero",enabled:true,heading:leadName,body:safeText(research.executiveSummary,700)},
    {id:"audience",type:"rich_text",enabled:true,heading:"Who this store is for",body:safeText(research.targetCustomer,700)},
    {id:"products",type:"products",enabled:true,heading:"Research-backed opportunities",body:"No products are published automatically until supplier, cost, availability and product evidence are verified."},
    {id:"launch",type:"rich_text",enabled:true,heading:"Launch plan",body:research.launchPlan.slice(0,8).map((item,index)=>`${index+1}. ${safeText(item,220)}`).join("\n")},
  ];

  for(let attempt=0;attempt<5;attempt++){
    const slug=attempt===0?baseSlug:`${baseSlug}-${attempt+1}`;
    try{
      const inserted=await db.execute(sql`INSERT INTO merchant_storefronts (merchant_id,name,slug,public_key,description,theme,sections,published,created_by_clerk_user_id) VALUES (${owner.id},${leadName},${slug},${publicKey},${safeText(research.executiveSummary,1000)},${JSON.stringify(theme)}::jsonb,${JSON.stringify(sections)}::jsonb,false,${requestedBy}) RETURNING id,slug`);
      const storefront=(inserted.rows as Array<{id:string;slug:string}>)[0];
      if(!storefront) throw new Error("AI store draft was not persisted");
      return {ownerId:owner.id,storefrontId:storefront.id,slug:storefront.slug,opportunities};
    }catch(error){
      if(attempt===4||!String(error).toLowerCase().includes("unique")) throw error;
    }
  }
  throw new Error("Unable to allocate a unique AI store slug");
}

export async function runAdminAiStoreWorker(){
 if(running)return; running=true;
 try{
  const jobs=await db.execute(sql`SELECT id,requested_by,niche,status FROM admin_ai_store_jobs WHERE status IN ('queued','researching','building') ORDER BY created_at ASC LIMIT 5`);
  for(const job of jobs.rows as Array<{id:number;requested_by:string;niche:string|null;status:string}>){
   try{
    if(!providerConfigured()){await db.execute(sql`UPDATE admin_ai_store_jobs SET status='failed',error_message='No configured AI research provider is available. Configure Gemini or DeepSeek securely before this job can execute.',updated_at=now() WHERE id=${job.id} AND status IN ('queued','researching')`);continue;}
    if(job.status==='queued') await db.execute(sql`UPDATE admin_ai_store_jobs SET status='researching',updated_at=now() WHERE id=${job.id} AND status='queued'`);
    const current=await db.execute(sql`SELECT status,research,build_plan FROM admin_ai_store_jobs WHERE id=${job.id} LIMIT 1`);
    const row=(current.rows as Array<{status:string;research:ResearchResult;build_plan:any}>)[0];
    let research=row?.research;
    if(!research||!Array.isArray(research.productOpportunities)||research.productOpportunities.length===0){
      research=await executeResearch(job.niche);
      const buildPlan={state:"research_complete",requiresVerifiedInputs:true,noFakeData:true,productSelection:research.productOpportunities.slice(0,20),launchPlan:research.launchPlan,pricingGuidance:research.pricingGuidance,nextSteps:["Validate supplier availability and landed costs","Create store draft from approved research","Require real external authorization before social publishing or paid advertising"]};
      await db.execute(sql`UPDATE admin_ai_store_jobs SET status='building',research=${JSON.stringify(research)}::jsonb,build_plan=${JSON.stringify(buildPlan)}::jsonb,error_message=NULL,updated_at=now() WHERE id=${job.id} AND status IN ('researching','building')`);
    }else if(row?.status==='researching'){
      await db.execute(sql`UPDATE admin_ai_store_jobs SET status='building',updated_at=now() WHERE id=${job.id} AND status='researching'`);
    }
    const built=await buildStoreDraft(job.id,job.requested_by,job.niche,research);
    const finalPlan={...(row?.build_plan||{}),state:"store_draft_created",storefrontId:built.storefrontId,ownerMerchantId:built.ownerId,slug:built.slug,verifiedProductCandidates:built.opportunities,publicationRequiresReview:true,noFakeProducts:true};
    await db.execute(sql`UPDATE admin_ai_store_jobs SET status='ready_for_review',build_plan=${JSON.stringify(finalPlan)}::jsonb,error_message=NULL,completed_at=now(),updated_at=now() WHERE id=${job.id} AND status='building'`);
   }catch(error){await db.execute(sql`UPDATE admin_ai_store_jobs SET status='failed',error_message=${String(error instanceof Error?error.message:'AI store worker failed').slice(0,2000)},updated_at=now() WHERE id=${job.id} AND status IN ('queued','researching','building')`);}
  }
 }finally{running=false;}
}
export function startAdminAiStoreWorker(){void runAdminAiStoreWorker();const timer=setInterval(()=>void runAdminAiStoreWorker(),INTERVAL_MS);timer.unref?.();return()=>clearInterval(timer);}
