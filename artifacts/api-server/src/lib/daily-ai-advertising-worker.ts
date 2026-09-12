import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const INTERVAL_MS = 15 * 60 * 1000;
let running = false;
function idempotency(merchantId: number, slot: number, channel: string, productId: number) {
  return createHash("sha256").update(`daily-ai-ad:${merchantId}:${new Date().toISOString().slice(0, 10)}:${slot}:${channel}:${productId}`).digest("hex");
}

/** Plans daily advertising server-side for every enabled merchant. */
export async function runDailyAiAdvertisingPlanner() {
  if (running) return;
  running = true;
  try {
    const merchants = await db.execute(sql`SELECT m.id,COALESCE(s.daily_ad_limit,3) AS daily_ad_limit,COALESCE(s.enabled,true) AS enabled,COALESCE(s.channels,'[]'::jsonb) AS channels FROM merchants m LEFT JOIN ai_ad_schedules s ON s.merchant_id=m.id WHERE m.status='active'`);
    for (const merchant of merchants.rows as Array<{id:number;daily_ad_limit:number;enabled:boolean;channels:unknown}>) {
      if (!merchant.enabled) continue;
      const limit = Math.max(0, Math.min(100, Number(merchant.daily_ad_limit ?? 3)));
      const channels = Array.isArray(merchant.channels) ? merchant.channels.filter((v): v is string => typeof v === "string") : [];
      if (!limit || !channels.length) continue;
      try {
        await db.transaction(async tx => {
          const existing = await tx.execute(sql`SELECT COUNT(*)::int AS count FROM ai_daily_ad_plans WHERE merchant_id=${merchant.id} AND plan_date=CURRENT_DATE`);
          if (Number((existing.rows[0] as {count?:number}|undefined)?.count ?? 0) >= limit) return;
          const products = await tx.execute(sql`SELECT id,title FROM supplier_products WHERE merchant_id=${merchant.id} AND status='active' AND visibility='active' ORDER BY updated_at DESC LIMIT 100`);
          const rows = products.rows as Array<{id:number;title:string}>;
          if (!rows.length) return;
          for (let slot=1; slot<=limit; slot++) {
            const product=rows[(slot-1)%rows.length]; const channel=channels[(slot-1)%channels.length]; if(!product||!channel) continue;
            const key=idempotency(merchant.id,slot,channel,Number(product.id));
            const scheduledAt=new Date(Date.now()+Math.round((slot/(limit+1))*18*60*60*1000));
            const inserted=await tx.execute(sql`INSERT INTO ai_daily_ad_plans (merchant_id,plan_date,slot_index,scheduled_at,product_id,channel,status,reason) VALUES (${merchant.id},CURRENT_DATE,${slot},${scheduledAt.toISOString()},${product.id},${channel},'planned',${`Daily AI slot ${slot}: ${product.title}`}) ON CONFLICT (merchant_id,plan_date,slot_index) DO NOTHING RETURNING id`);
            if(!inserted.rows.length) continue;
            await tx.execute(sql`INSERT INTO merchant_automation_audit (merchant_id,action_type,status,entity_type,entity_id,idempotency_key,reason,metadata) VALUES (${merchant.id},'daily_ad_plan','planned','ai_daily_ad_plan',${String((inserted.rows[0] as {id?:number}).id??'')},${key},'Server daily AI advertising planner',${JSON.stringify({slot,channel,productId:product.id})}::jsonb) ON CONFLICT (idempotency_key) DO NOTHING`);
          }
          await tx.execute(sql`UPDATE ai_ad_schedules SET last_planned_at=now(),updated_at=now() WHERE merchant_id=${merchant.id}`);
        });
      } catch { /* isolate tenant failures */ }
    }
  } finally { running=false; }
}

export function startDailyAiAdvertisingPlanner() {
  void runDailyAiAdvertisingPlanner();
  const timer=setInterval(()=>void runDailyAiAdvertisingPlanner(),INTERVAL_MS);
  timer.unref?.();
  return ()=>clearInterval(timer);
}
