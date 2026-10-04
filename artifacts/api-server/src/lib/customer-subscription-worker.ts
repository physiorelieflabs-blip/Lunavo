import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
function executeQuery(executor: { execute: (query: unknown) => Promise<any> }, query: { sql: string; values: unknown[] }) {
  const literal = (value: unknown) => {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    if (value instanceof Date) return "'" + value.toISOString().replace(/'/g, "''") + "'";
    return "'" + String(value).replace(/'/g, "''") + "'";
  };
  return executor.execute(sql.raw(query.sql.replace(/\$(\d+)/g, (_, n) => literal(query.values[Number(n) - 1]))));
}
import { db, pool } from "@workspace/db";
import { initializeFlutterwavePayment } from "./flutterwave-client";

const POLL_MS=5*60*1000;
const WORKER_LOCK_KEY = "lunavo:customer-subscription-renewals";
let running=false;
async function runDueRenewals(){
  if(running)return; running=true;
  let lockClient: Awaited<ReturnType<typeof pool.connect>> | null = null;
  let lockAcquired = false;
  try{
    lockClient = await pool.connect();
    const lock = await lockClient.query<{locked:boolean}>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked",[WORKER_LOCK_KEY]);
    lockAcquired = lock.rows[0]?.locked === true;
    if(!lockAcquired)return;
    await executeQuery(db,{sql:"UPDATE customer_subscription_payment_attempts SET status='expired',updated_at=now() WHERE status='submitted' AND created_at < now()-interval '24 hours'",values:[]});
    await executeQuery(db,{sql:"UPDATE customer_subscriptions s SET failed_attempts=s.failed_attempts+1,status=CASE WHEN s.failed_attempts+1>=s.max_failed_attempts THEN 'expired' ELSE 'past_due' END,updated_at=now() FROM (SELECT subscription_id FROM customer_subscription_payment_attempts WHERE status='expired' AND updated_at > now()-interval '10 minutes') a WHERE s.id=a.subscription_id AND s.status IN ('active','past_due')",values:[]});
    const q=await executeQuery(db,{sql:"SELECT s.*,c.name customer_name,c.email customer_email,p.name plan_name,m.store_name,p.product_id,l.id location_id FROM customer_subscriptions s JOIN customers c ON c.id=s.customer_id JOIN customer_subscription_plans p ON p.id=s.plan_id JOIN merchants m ON m.id=s.merchant_id JOIN supplier_products sp ON sp.id=p.product_id LEFT JOIN LATERAL (SELECT id FROM merchant_locations ml WHERE ml.merchant_id=s.merchant_id AND ml.is_active=true ORDER BY ml.is_default DESC,ml.created_at ASC LIMIT 1) l ON true WHERE s.status IN ('active','past_due') AND s.next_charge_at<=now() AND NOT EXISTS (SELECT 1 FROM customer_subscription_payment_attempts a WHERE a.subscription_id=s.id AND a.status IN ('created','submitted') AND a.created_at>now()-interval '24 hours') LIMIT 50",values:[]});
    for(const row of q.rows as any[]){
      const ref="CSUB-RENEW-"+String(row.id).slice(0,8)+"-"+Date.now()+"-"+randomUUID().slice(0,8);
      if(!row.location_id)continue;
      try{
        const attemptNo=Number(row.failed_attempts)+1;
        const created=await db.transaction(async(tx)=>{
          const order=(await executeQuery(tx,{sql:"INSERT INTO orders (merchant_id,location_id,customer_id,order_number,subtotal,tax_amount,shipping_amount,total,quantity,currency,status,supplier_product_id,fulfillment_status,idempotency_key) VALUES ($1,$2,$3,$4,$5,0,0,$5,1,$6,'pending',$7,'not_applicable',$4) RETURNING id",values:[row.merchant_id,String(row.location_id),row.customer_id,ref,Number(row.amount_minor)/100,String(row.currency).toUpperCase(),row.product_id]})).rows[0] as any;
          const intent=(await executeQuery(tx,{sql:"INSERT INTO payment_intents (merchant_id,order_id,amount_minor,currency,method,status,idempotency_key,customer_subscription_id) VALUES ($1,$2,$3,$4,'flutterwave','created',$5,$6) RETURNING id",values:[row.merchant_id,order.id,row.amount_minor,String(row.currency).toUpperCase(),ref,row.id]})).rows[0] as any;
          const attempt=(await executeQuery(tx,{sql:"INSERT INTO customer_subscription_payment_attempts (subscription_id,attempt_number,payment_intent_id,order_id,amount_minor,currency,status,due_at) VALUES ($1,$2,$3,$4,$5,$6,'created',now()) RETURNING id",values:[row.id,attemptNo,intent.id,order.id,row.amount_minor,String(row.currency).toUpperCase()]})).rows[0] as any;
          return {orderId:Number(order.id),paymentIntentId:Number(intent.id),attemptId:String(attempt.id)};
        });
        const base=(process.env.LUNAVO_PUBLIC_BASE_URL||"").trim(); if(!base)throw new Error("LUNAVO_PUBLIC_BASE_URL is required for renewal links");
        const checkout=await initializeFlutterwavePayment({txRef:ref,amount:Number(row.amount_minor)/100,currency:String(row.currency).toUpperCase(),redirectUrl:base+"/subscribe/return?subscription="+encodeURIComponent(String(row.id)),customer:{email:String(row.customer_email),name:String(row.customer_name)},title:String(row.plan_name)+" · "+String(row.store_name),meta:{merchant_id:Number(row.merchant_id),customer_id:Number(row.customer_id),order_id:created.orderId,payment_intent_id:created.paymentIntentId,customer_subscription_id:String(row.id),subscription_attempt_id:created.attemptId}});
        await executeQuery(db,{sql:"UPDATE payment_intents SET status='submitted',checkout_url=$1,evidence_reference=$2,updated_at=now() WHERE id=$3",values:[checkout.link,ref,created.paymentIntentId]});
        await executeQuery(db,{sql:"UPDATE customer_subscription_payment_attempts SET status='submitted',checkout_url=$1,updated_at=now() WHERE id=$2",values:[checkout.link,created.attemptId]});
      }catch(error){
        await executeQuery(db,{sql:"UPDATE customer_subscriptions SET failed_attempts=failed_attempts+1,status=CASE WHEN failed_attempts+1>=max_failed_attempts THEN 'expired' ELSE 'past_due' END,updated_at=now() WHERE id=$1 AND status IN ('active','past_due')",values:[row.id]});
        await executeQuery(db,{sql:"INSERT INTO customer_subscription_events(subscription_id,event_type,event_key,payload) VALUES ($1,'renewal_preparation_failed',$2,$3::jsonb) ON CONFLICT(event_key) DO NOTHING",values:[row.id,ref,JSON.stringify({reason:error instanceof Error?error.message:"Renewal preparation failed"})]});
      }
    }
  }catch(error){console.error("Customer subscription worker failed",error);}
  finally{
    if(lockClient){
      if(lockAcquired){
        try{await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))",[WORKER_LOCK_KEY]);}
        catch(error){console.error("Customer subscription worker lock release failed",error);}
      }
      lockClient.release();
    }
    running=false;
  }
}
export function startCustomerSubscriptionWorker(){void runDueRenewals();const timer=setInterval(()=>void runDueRenewals(),POLL_MS);timer.unref?.();return()=>clearInterval(timer);}
