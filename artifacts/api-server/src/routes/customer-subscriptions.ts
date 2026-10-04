import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import { db, merchantsTable, supplierProductsTable } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { requirePermission } from "../lib/tenant-access";
import { initializeFlutterwavePayment } from "../lib/flutterwave-client";

const router=Router();
const fail=(res:Response,status:number,error:string)=>{res.status(status).json({error});};
const txt=(v:unknown,max=240)=>typeof v==="string"?v.trim().slice(0,max):"";
const email=(v:unknown)=>txt(v,240).toLowerCase();
const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
const token=()=>randomBytes(32).toString("base64url");
const addPeriod=(base:Date,unit:string,count:number)=>{const d=new Date(base);if(unit==="day")d.setUTCDate(d.getUTCDate()+count);else if(unit==="week")d.setUTCDate(d.getUTCDate()+count*7);else if(unit==="month")d.setUTCMonth(d.getUTCMonth()+count);else d.setUTCFullYear(d.getUTCFullYear()+count);return d;};
async function merchantFor(req:Request){const userId=getAuth(req).userId;if(!userId)return null;const m=(await db.select().from(merchantsTable).where(and(eq(merchantsTable.status,"active"),or(eq(merchantsTable.clerkUserId,userId),eq(merchantsTable.localAuthUserId,userId)))).limit(1))[0]??null;if(!m)return null;await requirePermission(userId,m.id,"customers.manage");return m;}
function requestOrigin(req:Request){const host=txt(req.get("host"),200);const proto=txt(req.get("x-forwarded-proto")||"https",12).split(",")[0];return host&&/^[a-z0-9.:-]+$/i.test(host)?proto+"://"+host:"";}

router.get("/commerce/customer-subscription-plans",async(req,res)=>{const m=await merchantFor(req);if(!m)return fail(res,401,"Authentication required");const q=await db.execute({sql:"SELECT p.*,sp.title AS product_title FROM customer_subscription_plans p JOIN supplier_products sp ON sp.id=p.product_id WHERE p.merchant_id=$1 ORDER BY p.created_at DESC",values:[m.id]});res.json({plans:q.rows});});
router.post("/commerce/customer-subscription-plans",async(req,res)=>{
  const m=await merchantFor(req);if(!m)return fail(res,401,"Authentication required");
  const productId=Number(req.body?.productId),name=txt(req.body?.name,120),description=txt(req.body?.description,500)||null;
  const unit=["day","week","month","year"].includes(req.body?.intervalUnit)?String(req.body.intervalUnit):"month";
  const count=Math.min(12,Math.max(1,Number(req.body?.intervalCount)||1)),grace=Math.min(30,Math.max(0,Number(req.body?.gracePeriodDays)||3)),maxFailed=Math.min(12,Math.max(1,Number(req.body?.maxFailedAttempts)||4));
  if(!Number.isInteger(productId)||productId<1||!name)return fail(res,400,"Choose a real product and plan name");
  const p=(await db.select().from(supplierProductsTable).where(and(eq(supplierProductsTable.id,productId),eq(supplierProductsTable.merchantId,m.id),eq(supplierProductsTable.status,"active"),eq(supplierProductsTable.visibility,"active"))).limit(1))[0];
  if(!p||p.sellingPrice===null)return fail(res,422,"The plan product must be active, visible and priced");
  const amountMinor=Math.round(Number(p.sellingPrice)*100);if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)return fail(res,422,"Product price is invalid");
  const q=await db.execute({sql:"INSERT INTO customer_subscription_plans (merchant_id,product_id,name,description,amount_minor,currency,interval_unit,interval_count,grace_period_days,max_failed_attempts,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) ON CONFLICT (merchant_id,name) DO NOTHING RETURNING *",values:[m.id,productId,name,description,amountMinor,String(p.currency).toUpperCase(),unit,count,grace,maxFailed,getAuth(req).userId]});
  if(!q.rows.length)return fail(res,409,"A plan with that name already exists");
  res.status(201).json({plan:q.rows[0]});
});

router.get("/public/customer-subscription-plans/:id",async(req,res)=>{const id=txt(req.params.id,80);const q=await db.execute({sql:"SELECT p.id,p.merchant_id,p.name,p.description,p.amount_minor,p.currency,p.interval_unit,p.interval_count,p.grace_period_days,sp.title AS product_title,sp.image_url AS product_image_url,m.store_name FROM customer_subscription_plans p JOIN merchants m ON m.id=p.merchant_id JOIN supplier_products sp ON sp.id=p.product_id WHERE p.id=$1 AND p.status='active' AND m.status='active' AND sp.status='active' AND sp.visibility='active' LIMIT 1",values:[id]});if(!q.rows.length)return fail(res,404,"Subscription plan not found");res.json({plan:q.rows[0]});});

async function preparePayment(subscriptionId:string,manageToken:string,req:Request){
  const q=await db.execute({sql:"SELECT s.*,c.name AS customer_name,c.email AS customer_email,p.name AS plan_name,p.grace_period_days,m.store_name,sp.title AS product_title,sp.id AS product_id,l.id AS location_id FROM customer_subscriptions s JOIN customers c ON c.id=s.customer_id JOIN customer_subscription_plans p ON p.id=s.plan_id JOIN merchants m ON m.id=s.merchant_id JOIN supplier_products sp ON sp.id=p.product_id LEFT JOIN merchant_locations l ON l.merchant_id=s.merchant_id AND l.is_active=true AND l.is_default=true WHERE s.id=$1 AND s.manage_token_hash=$2 LIMIT 1",values:[subscriptionId,hash(manageToken)]});
  const s=q.rows[0] as any;if(!s)throw Object.assign(new Error("Subscription portal authorization failed"),{statusCode:403});
  if(!["pending_payment","active","past_due"].includes(String(s.status)))throw Object.assign(new Error("This subscription is not payable"),{statusCode:409});
  if(!s.location_id)throw new Error("Merchant has no active default location");
  const recent=await db.execute({sql:"SELECT attempt_number,checkout_url FROM customer_subscription_payment_attempts WHERE subscription_id=$1 AND status IN ('created','submitted') AND created_at>now()-interval '15 minutes' ORDER BY created_at DESC LIMIT 1",values:[subscriptionId]});
  if(recent.rows.length) return {paymentUrl:(recent.rows[0] as any).checkout_url||null,attemptNumber:Number((recent.rows[0] as any).attempt_number)};
  const last=await db.execute({sql:"SELECT COALESCE(MAX(attempt_number),0)::int AS n FROM customer_subscription_payment_attempts WHERE subscription_id=$1",values:[subscriptionId]});
  const n=Number((last.rows[0] as any)?.n||0)+1,ref="CSUB-"+subscriptionId.slice(0,8)+"-"+Date.now()+"-"+randomUUID().slice(0,8);
  const created=await db.transaction(async(tx)=>{
    const order=(await tx.execute({sql:"INSERT INTO orders (merchant_id,location_id,customer_id,order_number,subtotal,tax_amount,shipping_amount,total,quantity,currency,status,supplier_product_id,fulfillment_status,idempotency_key) VALUES ($1,$2,$3,$4,$5,0,0,$5,1,$6,'pending',$7,'not_applicable',$4) RETURNING id",values:[Number(s.merchant_id),String(s.location_id),Number(s.customer_id),ref,Number(s.amount_minor)/100,String(s.currency).toUpperCase(),Number(s.product_id)]})).rows[0] as any;
    if(!order)throw new Error("Subscription order could not be created");
    const intent=(await tx.execute({sql:"INSERT INTO payment_intents (merchant_id,order_id,amount_minor,currency,method,status,idempotency_key,customer_subscription_id) VALUES ($1,$2,$3,$4,'flutterwave','created',$5,$6) RETURNING id",values:[Number(s.merchant_id),Number(order.id),Number(s.amount_minor),String(s.currency).toUpperCase(),ref,subscriptionId]})).rows[0] as any;
    if(!intent)throw new Error("Subscription payment intent could not be created");
    const attempt=(await tx.execute({sql:"INSERT INTO customer_subscription_payment_attempts (subscription_id,attempt_number,payment_intent_id,order_id,amount_minor,currency,status,due_at) VALUES ($1,$2,$3,$4,$5,$6,'created',$7) RETURNING id",values:[subscriptionId,n,Number(intent.id),Number(order.id),Number(s.amount_minor),String(s.currency).toUpperCase(),new Date().toISOString()]})).rows[0] as any;
    if(!attempt)throw new Error("Subscription payment attempt could not be created");
    return {orderId:Number(order.id),paymentIntentId:Number(intent.id),attemptId:String(attempt.id),attemptNumber:n,reference:ref};
  });
  const base=requestOrigin(req)||txt(process.env.LUNAVO_PUBLIC_BASE_URL,300);if(!base)throw new Error("Public base URL is unavailable");
  const checkout=await initializeFlutterwavePayment({txRef:created.reference,amount:Number(s.amount_minor)/100,currency:String(s.currency).toUpperCase(),redirectUrl:base+"/subscribe/return?subscription="+encodeURIComponent(subscriptionId),customer:{email:String(s.customer_email),name:String(s.customer_name)},title:String(s.plan_name)+" · "+String(s.store_name),meta:{merchant_id:Number(s.merchant_id),customer_id:Number(s.customer_id),order_id:created.orderId,payment_intent_id:created.paymentIntentId,customer_subscription_id:subscriptionId,subscription_attempt_id:created.attemptId}});
  await db.execute({sql:"UPDATE payment_intents SET status='submitted',checkout_url=$1,evidence_reference=$2,updated_at=now() WHERE id=$3",values:[checkout.link,created.reference,created.paymentIntentId]});
  await db.execute({sql:"UPDATE customer_subscription_payment_attempts SET status='submitted',checkout_url=$1,updated_at=now() WHERE id=$2",values:[checkout.link,created.attemptId]});
  return {paymentUrl:checkout.link,attemptNumber:created.attemptNumber};
}

router.post("/public/customer-subscriptions/subscribe",async(req,res)=>{
  const planId=txt(req.body?.planId,80),name=txt(req.body?.customerName,120),customerEmail=email(req.body?.customerEmail),idem=txt(req.body?.idempotencyKey,120);
  if(!planId||!name||!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(customerEmail)||idem.length<8)return fail(res,400,"Plan, customer details and idempotency key are required");
  const p=(await db.execute({sql:"SELECT * FROM customer_subscription_plans WHERE id=$1 AND status='active' LIMIT 1",values:[planId]})).rows[0] as any;if(!p)return fail(res,404,"Subscription plan not found");
  const existing=(await db.execute({sql:"SELECT s.id FROM customer_subscriptions s JOIN customers c ON c.id=s.customer_id WHERE s.plan_id=$1 AND c.merchant_id=$2 AND lower(c.email)=$3 AND s.status IN ('pending_payment','active','past_due') LIMIT 1",values:[planId,Number(p.merchant_id),customerEmail]})).rows[0] as any;if(existing)return fail(res,409,"This email already has an active subscription for this plan");
  const c=await db.execute({sql:"INSERT INTO customers (merchant_id,name,email) VALUES ($1,$2,$3) ON CONFLICT (merchant_id,email) DO UPDATE SET name=EXCLUDED.name,updated_at=now() RETURNING id",values:[Number(p.merchant_id),name,customerEmail]});
  const customerId=Number((c.rows[0] as any)?.id);if(!customerId)return fail(res,500,"Customer record could not be created");
  const rawToken=token(),start=new Date(),end=addPeriod(start,String(p.interval_unit),Number(p.interval_count)),grace=new Date(end.getTime()+Number(p.grace_period_days)*86400000);
  const sub=await db.execute({sql:"INSERT INTO customer_subscriptions (merchant_id,plan_id,customer_id,status,amount_minor,currency,interval_unit,interval_count,current_period_start,current_period_end,next_charge_at,grace_until,max_failed_attempts,manage_token_hash,manage_token_hint) VALUES ($1,$2,$3,'pending_payment',$4,$5,$6,$7,$8,$9,$8,$10,$11,$12,$13) RETURNING id",values:[Number(p.merchant_id),planId,customerId,Number(p.amount_minor),String(p.currency).toUpperCase(),String(p.interval_unit),Number(p.interval_count),start.toISOString(),end.toISOString(),grace.toISOString(),Number(p.max_failed_attempts),hash(rawToken),rawToken.slice(-6)]});
  const subscriptionId=String((sub.rows[0] as any)?.id);if(!subscriptionId)throw new Error("Subscription could not be created");
  try{const payment=await preparePayment(subscriptionId,rawToken,req);res.status(201).json({subscriptionId,manageToken:rawToken,manageTokenHint:rawToken.slice(-6),paymentUrl:payment.paymentUrl,status:"pending_payment"});}catch(e){await db.execute({sql:"UPDATE customer_subscriptions SET status='expired',cancel_reason=$1,updated_at=now() WHERE id=$2",values:[e instanceof Error?e.message:"Payment preparation failed",subscriptionId]});fail(res,(e as any)?.statusCode||503,e instanceof Error?e.message:"Payment could not be prepared");}
});

router.get("/public/customer-subscriptions/portal",async(req,res)=>{
  const t=txt(req.query?.token,220);if(!t)return fail(res,400,"Subscription portal token required");
  const s=await db.execute({sql:"SELECT s.id,s.status,s.amount_minor,s.currency,s.interval_unit,s.interval_count,s.current_period_start,s.current_period_end,s.next_charge_at,s.grace_until,s.failed_attempts,s.max_failed_attempts,s.cancelled_at,p.name AS plan_name,m.store_name,sp.title AS product_title FROM customer_subscriptions s JOIN customer_subscription_plans p ON p.id=s.plan_id JOIN merchants m ON m.id=s.merchant_id JOIN supplier_products sp ON sp.id=p.product_id WHERE s.manage_token_hash=$1 LIMIT 1",values:[hash(t)]});
  if(!s.rows.length)return fail(res,404,"Subscription portal not found");
  const a=await db.execute({sql:"SELECT attempt_number,status,amount_minor,currency,due_at,checkout_url,failure_reason,created_at FROM customer_subscription_payment_attempts WHERE subscription_id=$1 ORDER BY attempt_number DESC LIMIT 20",values:[String((s.rows[0] as any).id)]});
  res.json({subscription:s.rows[0],attempts:a.rows});
});
router.post("/public/customer-subscriptions/pay",async(req,res)=>{const t=txt(req.body?.token,220);if(!t)return fail(res,400,"Subscription portal token required");const s=(await db.execute({sql:"SELECT id FROM customer_subscriptions WHERE manage_token_hash=$1 LIMIT 1",values:[hash(t)]})).rows[0] as any;if(!s)return fail(res,404,"Subscription portal not found");try{res.json(await preparePayment(String(s.id),t,req));}catch(e){fail(res,(e as any)?.statusCode||503,e instanceof Error?e.message:"Payment could not be prepared");}});
router.post("/public/customer-subscriptions/cancel",async(req,res)=>{const t=txt(req.body?.token,220),reason=txt(req.body?.reason,300)||"Customer requested cancellation";if(!t)return fail(res,400,"Subscription portal token required");const q=await db.execute({sql:"UPDATE customer_subscriptions SET status='cancelled',cancel_reason=$1,cancelled_at=now(),updated_at=now() WHERE manage_token_hash=$2 AND status IN ('pending_payment','active','past_due') RETURNING id,status",values:[reason,hash(t)]});if(!q.rows.length)return fail(res,404,"Subscription not found or already closed");res.json({subscription:q.rows[0]});});
router.get("/commerce/customer-subscriptions",async(req,res)=>{const m=await merchantFor(req);if(!m)return fail(res,401,"Authentication required");const q=await db.execute({sql:"SELECT s.id,s.status,s.amount_minor,s.currency,s.interval_unit,s.interval_count,s.current_period_start,s.current_period_end,s.next_charge_at,s.grace_until,s.failed_attempts,p.name AS plan_name,c.name AS customer_name,c.email AS customer_email,sp.title AS product_title FROM customer_subscriptions s JOIN customer_subscription_plans p ON p.id=s.plan_id JOIN customers c ON c.id=s.customer_id JOIN supplier_products sp ON sp.id=p.product_id WHERE s.merchant_id=$1 ORDER BY s.created_at DESC LIMIT 500",values:[m.id]});res.json({subscriptions:q.rows});});

export default router;
