import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const INTERVAL_MS=30_000;
let running=false;

function providerConfigured(){
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim()||process.env.GEMINI_API_KEY?.trim());
}

/** Durable worker boundary for master-admin AI stores. It never fabricates research or
 * creates a store from placeholder data. A configured AI provider is required before a
 * job can progress beyond research; actual supplier/social integrations remain separately
 * authorised boundaries. */
export async function runAdminAiStoreWorker(){
 if(running)return; running=true;
 try{
  const jobs=await db.execute(sql`SELECT id,niche,status FROM admin_ai_store_jobs WHERE status IN ('queued','researching','building') ORDER BY created_at ASC LIMIT 5`);
  for(const job of jobs.rows as Array<{id:number;niche:string|null;status:string}>){
   try{
    if(!providerConfigured()){
      await db.execute(sql`UPDATE admin_ai_store_jobs SET status='failed',error_message='No configured AI research provider is available. Configure the provider securely before this job can execute.',updated_at=now() WHERE id=${job.id} AND status IN ('queued','researching')`);
      continue;
    }
    if(job.status==='queued'){
      await db.execute(sql`UPDATE admin_ai_store_jobs SET status='researching',research=jsonb_build_object('state','awaiting_provider_execution','niche',${job.niche}),updated_at=now() WHERE id=${job.id} AND status='queued'`);
      continue;
    }
    // Do not claim an AI result merely because credentials exist. Provider execution
    // is implemented by the dedicated AI research layer when its API contract is wired.
    await db.execute(sql`UPDATE admin_ai_store_jobs SET status='ready_for_review',research=jsonb_build_object('state','provider_ready','niche',${job.niche},'evidenceRequired',true),build_plan=jsonb_build_object('state','awaiting_verified_research','noFakeData',true),updated_at=now() WHERE id=${job.id} AND status='researching'`);
   }catch(error){
    await db.execute(sql`UPDATE admin_ai_store_jobs SET status='failed',error_message=${String(error instanceof Error?error.message:'AI store worker failed').slice(0,2000)},updated_at=now() WHERE id=${job.id} AND status IN ('queued','researching','building')`);
   }
  }
 }finally{running=false;}
}
export function startAdminAiStoreWorker(){void runAdminAiStoreWorker();const timer=setInterval(()=>void runAdminAiStoreWorker(),INTERVAL_MS);timer.unref?.();return()=>clearInterval(timer);}
