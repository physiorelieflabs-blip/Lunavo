import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const INTERVAL_MS = 15 * 60 * 1000;
let running = false;
function idempotency(merchantId: number, storefrontId: string, slot: number, channel: string, productId: number, date: string) { return createHash("sha256").update(`daily-ai-ad:${merchantId}:${storefrontId}:${date}:${slot}:${channel}:${productId}`).digest("hex"); }
function merchantToday(timeZone: string): { date: string; hour: number } {
  try { const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timeZone||"UTC",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date()); const get=(type:string)=>parts.find(p=>p.type===type)?.value??"00"; return {date:`${get("year")}-${get("month")}-${get("day")}`,hour:Number(get("hour"))}; }
  catch { const now=new Date(); return {date:now.toISOString().slice(0,10),hour:now.getUTCHours()}; }
}
function localDateHourToUtc(date:string,hour:number,timeZone:string){
  let guess=new Date(`${date}T${String(Math.max(0,Math.min(23,hour))).padStart(2,"0")}:00:00.000Z`);
  for(let i=0;i<3;i++){
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:timeZone||"UTC",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(guess);
    const get=(t:string)=>parts.find(p=>p.type===t)?.value??"00";
    const local=Date.UTC(Number(get("year")),Number(get("month"))-1,Number(get("day")),Number(get("hour")),Number(get("minute")));
    const target=Date.parse(`${date}T${String(Math.max(0,Math.min(23,hour))).padStart(2,"0")}:00:00.000Z`);
    guess=new Date(guess.getTime()+(target-local));
  }
  return guess;
}
function scheduledSlot(date:string,timeZone:string,index:number,count:number){const minute=Math.floor((index+0.5)*24*60/Math.max(1,count));return localDateHourToUtc(date,Math.floor(minute/60),timeZone).getTime()+((minute%60)*60_000);}

/** Creates one independently idempotent daily plan set for every active storefront. Plans are not external publications. */
export async function runDailyAiAdvertisingPlanner() {
  if(running)return; running=true;
  try{
    const merchants=await db.execute(sql`SELECT m.id,COALESCE(s.daily_ad_limit,3) AS daily_ad_limit,COALESCE(s.enabled,true) AS enabled,COALESCE(s.channels,'[]'::jsonb) AS channels,COALESCE(NULLIF(m.timezone,''),'UTC') AS timezone FROM merchants m LEFT JOIN ai_ad_schedules s ON s.merchant_id=m.id WHERE m.status='active'`);
    for(const merchant of merchants.rows as Array<{id:number;daily_ad_limit:number;enabled:boolean;channels:unknown;timezone:string}>){
      if(!merchant.enabled)continue;
      const limit=Math.max(0,Math.min(10000,Number(merchant.daily_ad_limit??3)));
      const channels=Array.isArray(merchant.channels)?merchant.channels.filter((v):v is string=>typeof v==="string"):[];
      if(!limit||!channels.length)continue;
      const today=merchantToday(merchant.timezone);
      try{await db.transaction(async tx=>{
        const stores=await tx.execute(sql`SELECT id FROM merchant_storefronts WHERE merchant_id=${merchant.id} AND published=true ORDER BY created_at ASC`);
        const storefronts=stores.rows as Array<{id:string}>;
        if(!storefronts.length)return;
        const products=await tx.execute(sql`SELECT id,title FROM supplier_products WHERE merchant_id=${merchant.id} AND status='active' AND visibility='active' ORDER BY updated_at DESC LIMIT 100`);
        const rows=products.rows as Array<{id:number;title:string}>;
        if(!rows.length)return;
        for(const storefront of storefronts){
          const existing=await tx.execute(sql`SELECT COUNT(*)::int AS count FROM ai_daily_ad_plans WHERE merchant_id=${merchant.id} AND storefront_id=${storefront.id} AND plan_date=${today.date}`);
          if(Number((existing.rows[0] as {count?:number}|undefined)?.count??0)>=limit)continue;
          for(let slot=1;slot<=limit;slot++){
            const product=rows[(slot-1)%rows.length],channel=channels[(slot-1)%channels.length];
            if(!product||!channel)continue;
            const key=idempotency(merchant.id,storefront.id,slot,channel,Number(product.id),today.date);
            const scheduledAt=new Date(scheduledSlot(today.date,merchant.timezone,slot-1,limit));
            const inserted=await tx.execute(sql`INSERT INTO ai_daily_ad_plans (merchant_id,storefront_id,plan_date,slot_index,scheduled_at,product_id,channel,status,reason) VALUES (${merchant.id},${storefront.id},${today.date},${slot},${scheduledAt.toISOString()},${product.id},${channel},'planned',${`Store ${storefront.id}: daily AI slot ${slot}: ${product.title}`}) ON CONFLICT (merchant_id,plan_date,storefront_id,slot_index) DO NOTHING RETURNING id`);
            if(!inserted.rows.length)continue;
            await tx.execute(sql`INSERT INTO merchant_automation_audit (merchant_id,action_type,status,entity_type,entity_id,idempotency_key,reason,metadata) VALUES (${merchant.id},'daily_ad_plan','planned','ai_daily_ad_plan',${String((inserted.rows[0] as {id?:number}).id??'')},${key},'Server daily AI advertising planner',${JSON.stringify({slot,channel,productId:product.id,storefrontId:storefront.id,timezone:merchant.timezone,localDate:today.date})}::jsonb) ON CONFLICT (idempotency_key) DO NOTHING`);
          }
        }
        await tx.execute(sql`UPDATE ai_ad_schedules SET last_planned_at=now(),updated_at=now() WHERE merchant_id=${merchant.id}`);
      });}catch{/* isolate tenant failures */}
    }
  }finally{running=false;}
}
export function startDailyAiAdvertisingPlanner(){void runDailyAiAdvertisingPlanner();const timer=setInterval(()=>void runDailyAiAdvertisingPlanner(),INTERVAL_MS);timer.unref?.();return()=>clearInterval(timer);}
