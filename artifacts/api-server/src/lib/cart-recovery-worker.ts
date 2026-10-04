
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { emitDomainEvent } from "./domain-events";

const INTERVAL_MS=60_000;
let running=false;
export async function runCartRecoverySweep(){if(running)return;running=true;try{
 const result=await db.execute(sql`UPDATE abandoned_carts SET status='abandoned',abandoned_at=COALESCE(abandoned_at,now()),updated_at=now() WHERE status='active' AND subtotal_minor>0 AND last_activity_at < now()-interval '60 minutes' RETURNING id,merchant_id,session_key,customer_email,subtotal_minor,currency`);
 for(const row of result.rows as any[]){await emitDomainEvent(db,{merchantId:Number(row.merchant_id),eventType:"cart.abandoned",aggregateType:"abandoned_cart",aggregateId:String(row.id),actorType:"system",source:"system",idempotencyKey:`cart-abandoned:${row.id}`,payload:{cartId:String(row.id),sessionKey:String(row.session_key),customerEmail:row.customer_email,subtotalMinor:Number(row.subtotal_minor),currency:String(row.currency)}});}
}finally{running=false;}}
export function startCartRecoveryWorker(){void runCartRecoverySweep();const timer=setInterval(()=>void runCartRecoverySweep(),INTERVAL_MS);timer.unref?.();return()=>clearInterval(timer);}
