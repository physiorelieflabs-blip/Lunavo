import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { requirePermission } from "../lib/tenant-access";

const router = Router();

async function merchantFor(req: Request, res: Response, permission: "orders.read" | "orders.manage" | "refunds.manage" | "fulfillment.manage" | "team.manage") {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  const row = (await db.execute(sql`SELECT id,status FROM merchants WHERE clerk_user_id=${userId} LIMIT 1`)).rows[0] as {id?:number;status?:string}|undefined;
  const merchantId = Number(row?.id);
  if (!Number.isInteger(merchantId) || merchantId <= 0) { res.status(404).json({ error: "Merchant workspace not found" }); return null; }
  if (row?.status !== "active") { res.status(403).json({ error: "Merchant workspace is not active" }); return null; }
  try { await requirePermission(userId, merchantId, permission); } catch { res.status(403).json({ error: "Permission required" }); return null; }
  return { userId, merchantId };
}
function fail(res: Response, status: number, error: string) { res.status(status).json({ error }); }
function textValue(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length >= min && v.length <= max ? v : null;
}
function integerValue(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}
function isoDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
async function customerBelongs(merchantId: number, customerId: number | null) {
  if (customerId == null) return true;
  const row = (await db.execute(sql`SELECT id FROM customers WHERE id=${customerId} AND merchant_id=${merchantId} LIMIT 1`)).rows[0] as {id?:number}|undefined;
  return Number(row?.id) === customerId;
}
async function orderForMerchant(merchantId: number, orderId: number) {
  return (await db.execute(sql`SELECT id,customer_id,total,currency,status FROM orders WHERE id=${orderId} AND merchant_id=${merchantId} LIMIT 1`)).rows[0] as {id:number;customer_id:number;total:string|number;currency:string;status:string}|undefined;
}
async function audit(merchantId: number, userId: string, action: string, type: string, id: string) {
  await db.execute(sql`INSERT INTO audit_logs (id,user_id,merchant_id,action,resource_type,resource_id,changes,status,created_at)
    VALUES (${randomUUID()},${userId},${String(merchantId)},${action},${type},${id},{},'success',now())`);
}

router.get("/merchant/operations/overview", async (req,res,next)=>{
  try {
    const ctx=await merchantFor(req,res,"orders.read"); if(!ctx)return;
    const result=await db.execute(sql`
      SELECT
        (SELECT count(*) FROM support_tickets WHERE merchant_id=${ctx.merchantId} AND status IN ('open','pending'))::int AS open_tickets,
        (SELECT count(*) FROM service_bookings WHERE merchant_id=${ctx.merchantId} AND status IN ('requested','confirmed','rescheduled'))::int AS upcoming_bookings,
        (SELECT count(*) FROM return_requests WHERE merchant_id=${ctx.merchantId} AND status IN ('requested','approved','inspection'))::int AS open_returns,
        (SELECT count(*) FROM purchase_orders WHERE merchant_id=${ctx.merchantId} AND status IN ('ordered','partially_received'))::int AS open_purchase_orders,
        (SELECT count(*) FROM b2b_accounts WHERE merchant_id=${ctx.merchantId} AND status='approved')::int AS approved_b2b_accounts
    `);
    res.json(result.rows[0]);
  } catch(e){next(e);}
});

router.get("/merchant/operations/tickets", async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"orders.read");if(!ctx)return;
    const rows=await db.execute(sql`SELECT id,customer_id,order_id,subject,description,status,priority,assigned_to,created_by,created_at,updated_at,closed_at FROM support_tickets WHERE merchant_id=${ctx.merchantId} ORDER BY updated_at DESC LIMIT 100`);
    res.json({tickets:rows.rows});
  }catch(e){next(e);}
});
router.post("/merchant/operations/tickets", async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"orders.manage");if(!ctx)return;
    const subject=textValue(req.body?.subject,1,200), description=textValue(req.body?.description,1,10000);
    const priority=["low","normal","high","urgent"].includes(req.body?.priority)?req.body.priority:"normal";
    const customerId=integerValue(req.body?.customerId,1,2147483647), orderId=integerValue(req.body?.orderId,1,2147483647);
    if(!subject||!description)return fail(res,400,"Subject and description are required");
    if(!(await customerBelongs(ctx.merchantId,customerId)))return fail(res,404,"Customer not found");
    if(orderId!=null && !(await orderForMerchant(ctx.merchantId,orderId)))return fail(res,404,"Order not found");
    const id=randomUUID();
    await db.transaction(async tx=>{
      await tx.execute(sql`INSERT INTO support_tickets (id,merchant_id,customer_id,order_id,subject,description,priority,created_by) VALUES (${id},${ctx.merchantId},${customerId},${orderId},${subject},${description},${priority},${ctx.userId})`);
      await tx.execute(sql`INSERT INTO support_messages (id,ticket_id,merchant_id,author_type,author_id,body) VALUES (${randomUUID()},${id},${ctx.merchantId},'merchant',${ctx.userId},${description})`);
    });
    await audit(ctx.merchantId,ctx.userId,"support.ticket.created","support_ticket",id);
    res.status(201).json({id});
  }catch(e){next(e);}
});
router.get("/merchant/operations/tickets/:id/messages",async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"orders.read");if(!ctx)return;const id=req.params.id;
    const exists=await db.execute(sql`SELECT id FROM support_tickets WHERE id=${id} AND merchant_id=${ctx.merchantId} LIMIT 1`);if(!exists.rows.length)return fail(res,404,"Ticket not found");
    const rows=await db.execute(sql`SELECT id,author_type,author_id,body,created_at FROM support_messages WHERE ticket_id=${id} AND merchant_id=${ctx.merchantId} ORDER BY created_at ASC LIMIT 500`);
    res.json({messages:rows.rows});
  }catch(e){next(e);}
});
router.post("/merchant/operations/tickets/:id/messages",async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"orders.manage");if(!ctx)return;const id=req.params.id;const body=textValue(req.body?.body,1,12000);if(!body)return fail(res,400,"Message is required");
    const exists=await db.execute(sql`SELECT id FROM support_tickets WHERE id=${id} AND merchant_id=${ctx.merchantId} AND status<>'closed' LIMIT 1`);if(!exists.rows.length)return fail(res,404,"Open ticket not found");
    const messageId=randomUUID();await db.execute(sql`INSERT INTO support_messages (id,ticket_id,merchant_id,author_type,author_id,body) VALUES (${messageId},${id},${ctx.merchantId},'merchant',${ctx.userId},${body})`);
    await audit(ctx.merchantId,ctx.userId,"support.ticket.message_added","support_ticket",id);res.status(201).json({id:messageId});
  }catch(e){next(e);}
});
router.patch("/merchant/operations/tickets/:id",async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"orders.manage");if(!ctx)return;const status=String(req.body?.status||"");if(!["open","pending","resolved","closed"].includes(status))return fail(res,400,"Invalid ticket status");
    const result=await db.execute(sql`UPDATE support_tickets SET status=${status},closed_at=CASE WHEN ${status}='closed' THEN now() ELSE NULL END,updated_at=now() WHERE id=${req.params.id} AND merchant_id=${ctx.merchantId} RETURNING id,status`);
    if(!result.rows.length)return fail(res,404,"Ticket not found");await audit(ctx.merchantId,ctx.userId,"support.ticket.status_changed","support_ticket",req.params.id);res.json(result.rows[0]);
  }catch(e){next(e);}
});

router.get("/merchant/operations/bookings",async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"orders.read");if(!ctx)return;const rows=await db.execute(sql`SELECT id,customer_id,service_name,starts_at,ends_at,timezone,status,notes,created_at,updated_at FROM service_bookings WHERE merchant_id=${ctx.merchantId} ORDER BY starts_at DESC LIMIT 200`);res.json({bookings:rows.rows});}catch(e){next(e);}
});
router.post("/merchant/operations/bookings",async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"orders.manage");if(!ctx)return;
    const serviceName=textValue(req.body?.serviceName,1,200), startsAt=isoDate(req.body?.startsAt), endsAt=isoDate(req.body?.endsAt), timezone=textValue(req.body?.timezone||"UTC",1,100)||"UTC";
    const customerId=integerValue(req.body?.customerId,1,2147483647), notes=textValue(req.body?.notes||"",0,4000), key=(typeof req.headers["idempotency-key"]==="string"?req.headers["idempotency-key"]:typeof req.body?.idempotencyKey==="string"?req.body.idempotencyKey:"").trim().slice(0,200);
    if(!serviceName||!startsAt||!endsAt||endsAt<=startsAt||!key)return fail(res,400,"Valid service, start/end times, and Idempotency-Key are required");
    if(!(await customerBelongs(ctx.merchantId,customerId)))return fail(res,404,"Customer not found");
    try{
      const result=await db.execute(sql`INSERT INTO service_bookings (merchant_id,customer_id,service_name,starts_at,ends_at,timezone,status,notes,idempotency_key,created_by) VALUES (${ctx.merchantId},${customerId},${serviceName},${startsAt},${endsAt},${timezone},'requested',${notes},${key},${ctx.userId}) ON CONFLICT (merchant_id,idempotency_key) DO NOTHING RETURNING id`);
      if(!result.rows.length){const prior=await db.execute(sql`SELECT id FROM service_bookings WHERE merchant_id=${ctx.merchantId} AND idempotency_key=${key} LIMIT 1`);return res.json({id:(prior.rows[0] as any)?.id,replayed:true});}
      const id=String((result.rows[0] as any).id);await audit(ctx.merchantId,ctx.userId,"booking.created","service_booking",id);res.status(201).json({id});
    }catch(e:any){if(String(e?.message||e).includes("service_bookings_no_overlap"))return fail(res,409,"The requested time overlaps an active booking");throw e;}
  }catch(e){next(e);}
});
router.patch("/merchant/operations/bookings/:id",async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"orders.manage");if(!ctx)return;const status=String(req.body?.status||"");if(!["requested","confirmed","rescheduled","cancelled","completed","no_show"].includes(status))return fail(res,400,"Invalid booking status");
    const result=await db.execute(sql`UPDATE service_bookings SET status=${status},updated_at=now() WHERE id=${req.params.id} AND merchant_id=${ctx.merchantId} RETURNING id,status`);if(!result.rows.length)return fail(res,404,"Booking not found");await audit(ctx.merchantId,ctx.userId,"booking.status_changed","service_booking",req.params.id);res.json(result.rows[0]);
  }catch(e){next(e);}
});

router.get("/merchant/operations/returns",async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"orders.read");if(!ctx)return;const rows=await db.execute(sql`SELECT id,order_id,customer_id,reason,status,requested_amount_minor,currency,resolution,requested_by,reviewed_by,reviewed_at,created_at,updated_at FROM return_requests WHERE merchant_id=${ctx.merchantId} ORDER BY created_at DESC LIMIT 200`);res.json({returns:rows.rows});}catch(e){next(e);}
});
router.post("/merchant/operations/returns",async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"orders.manage");if(!ctx)return;const orderId=integerValue(req.body?.orderId,1,2147483647), reason=textValue(req.body?.reason,1,2000);const amount=integerValue(req.body?.amountMinor,1,2147483647);
    if(!orderId||!reason||!amount)return fail(res,400,"Order, reason, and a positive requested amount are required");
    const order=await orderForMerchant(ctx.merchantId,orderId);if(!order)return fail(res,404,"Order not found");
    const totalMinor=Math.round(Number(order.total)*100);if(!Number.isSafeInteger(totalMinor)||amount>totalMinor)return fail(res,400,"Requested return amount cannot exceed the order total");
    const id=randomUUID();await db.execute(sql`INSERT INTO return_requests (id,merchant_id,order_id,customer_id,reason,requested_amount_minor,currency,requested_by) VALUES (${id},${ctx.merchantId},${orderId},${order.customer_id},${reason},${amount},${String(order.currency).toUpperCase()},${ctx.userId})`);
    await audit(ctx.merchantId,ctx.userId,"return.requested","return_request",id);res.status(201).json({id,status:"requested",refundBoundary:"TS Pay/provider refund flow"});
  }catch(e){next(e);}
});
router.patch("/merchant/operations/returns/:id",async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"refunds.manage");if(!ctx)return;const status=String(req.body?.status||"");if(!["approved","inspection","denied","closed"].includes(status))return fail(res,400,"Return status must be approved, inspection, denied, or closed");
    const resolution=textValue(req.body?.resolution||"",0,2000);
    const result=await db.execute(sql`UPDATE return_requests SET status=${status},resolution=${resolution},reviewed_by=${ctx.userId},reviewed_at=now(),updated_at=now() WHERE id=${req.params.id} AND merchant_id=${ctx.merchantId} RETURNING id,status,resolution`);
    if(!result.rows.length)return fail(res,404,"Return request not found");await audit(ctx.merchantId,ctx.userId,"return.reviewed","return_request",req.params.id);res.json(result.rows[0]);
  }catch(e){next(e);}
});

router.get("/merchant/operations/purchase-orders",async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"fulfillment.manage");if(!ctx)return;const rows=await db.execute(sql`SELECT id,supplier_name,status,currency,notes,ordered_at,expected_at,created_at,updated_at FROM purchase_orders WHERE merchant_id=${ctx.merchantId} ORDER BY created_at DESC LIMIT 200`);const items=await db.execute(sql`SELECT id,purchase_order_id,supplier_product_id,description,quantity_ordered,quantity_received,unit_cost_minor,currency FROM purchase_order_items WHERE merchant_id=${ctx.merchantId} ORDER BY created_at ASC LIMIT 1000`);res.json({purchaseOrders:rows.rows,items:items.rows,financialBoundary:"Purchase orders are obligations/receiving records; supplier payment is not simulated."});}catch(e){next(e);}
});
router.post("/merchant/operations/purchase-orders",async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"fulfillment.manage");if(!ctx)return;const supplier=textValue(req.body?.supplierName,1,200), currency=textValue(String(req.body?.currency||"USD").toUpperCase(),3,3), key=(typeof req.headers["idempotency-key"]==="string"?req.headers["idempotency-key"]:typeof req.body?.idempotencyKey==="string"?req.body.idempotencyKey:"").trim().slice(0,200), inputItems=Array.isArray(req.body?.items)?req.body.items:[];
    if(!supplier||!currency||!/^[A-Z]{3}$/.test(currency)||!key||inputItems.length<1||inputItems.length>100)return fail(res,400,"Supplier, ISO currency, Idempotency-Key, and 1–100 items are required");
    const parsed=[] as Array<{supplierProductId:number|null;description:string;quantity:number;unitCostMinor:number}>;
    for(const item of inputItems){const description=textValue(item?.description,1,500),quantity=integerValue(item?.quantity,1,100000000),unitCostMinor=integerValue(item?.unitCostMinor,0,2147483647),supplierProductId=item?.supplierProductId==null?null:integerValue(item.supplierProductId,1,2147483647);if(!description||quantity==null||unitCostMinor==null||supplierProductId===undefined)return fail(res,400,"Invalid purchase-order item");if(supplierProductId!=null){const ok=await db.execute(sql`SELECT id FROM supplier_products WHERE id=${supplierProductId} AND merchant_id=${ctx.merchantId} LIMIT 1`);if(!ok.rows.length)return fail(res,404,"Supplier product not found");}parsed.push({supplierProductId,description,quantity,unitCostMinor});}
    const result=await db.transaction(async tx=>{const existing=await tx.execute(sql`SELECT id FROM purchase_orders WHERE merchant_id=${ctx.merchantId} AND idempotency_key=${key} LIMIT 1`);if(existing.rows.length)return {id:String((existing.rows[0] as any).id),replayed:true};
      const created=await tx.execute(sql`INSERT INTO purchase_orders (merchant_id,supplier_name,status,currency,notes,created_by,idempotency_key) VALUES (${ctx.merchantId},${supplier},'draft',${currency},${textValue(req.body?.notes||"",0,4000)},${ctx.userId},${key}) RETURNING id`);
      const id=String((created.rows[0] as any).id);for(const item of parsed)await tx.execute(sql`INSERT INTO purchase_order_items (purchase_order_id,merchant_id,supplier_product_id,description,quantity_ordered,unit_cost_minor,currency) VALUES (${id},${ctx.merchantId},${item.supplierProductId},${item.description},${item.quantity},${item.unitCostMinor},${currency})`);return {id,replayed:false};});
    await audit(ctx.merchantId,ctx.userId,"purchase_order.created","purchase_order",result.id);res.status(result.replayed?200:201).json(result);
  }catch(e){next(e);}
});
router.post("/merchant/operations/purchase-orders/:id/receive",async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"fulfillment.manage");if(!ctx)return;const input=Array.isArray(req.body?.items)?req.body.items:[];if(!input.length)return fail(res,400,"At least one receipt item is required");
    const result=await db.transaction(async tx=>{const po=(await tx.execute(sql`SELECT id,status FROM purchase_orders WHERE id=${req.params.id} AND merchant_id=${ctx.merchantId} LIMIT 1 FOR UPDATE`)).rows[0] as any;if(!po)return null;
      for(const item of input){const iid=String(item?.id||"");const qty=integerValue(item?.quantity,1,100000000);if(!iid||qty==null)throw new Error("Invalid receipt item");const row=(await tx.execute(sql`SELECT id,quantity_ordered,quantity_received FROM purchase_order_items WHERE id=${iid} AND purchase_order_id=${req.params.id} AND merchant_id=${ctx.merchantId} LIMIT 1 FOR UPDATE`)).rows[0] as any;if(!row)throw new Error("Receipt item not found");const next=Number(row.quantity_received)+qty;if(next>Number(row.quantity_ordered))throw new Error("Received quantity exceeds ordered quantity");await tx.execute(sql`UPDATE purchase_order_items SET quantity_received=${next} WHERE id=${iid}`);}
      const totals=(await tx.execute(sql`SELECT count(*)::int AS item_count, count(*) FILTER (WHERE quantity_received=quantity_ordered)::int AS full_count, count(*) FILTER (WHERE quantity_received>0)::int AS partial_count FROM purchase_order_items WHERE purchase_order_id=${req.params.id} AND merchant_id=${ctx.merchantId}`)).rows[0] as any;
      const status=Number(totals.full_count)===Number(totals.item_count)?"received":Number(totals.partial_count)>0?"partially_received":"ordered";await tx.execute(sql`UPDATE purchase_orders SET status=${status},updated_at=now() WHERE id=${req.params.id} AND merchant_id=${ctx.merchantId}`);return {status};});
    if(!result)return fail(res,404,"Purchase order not found");await audit(ctx.merchantId,ctx.userId,"purchase_order.received","purchase_order",req.params.id);res.json(result);
  }catch(e){next(e);}
});

router.get("/merchant/operations/b2b-accounts",async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"team.manage");if(!ctx)return;const accounts=await db.execute(sql`SELECT id,customer_id,company_name,tax_id,status,payment_terms_days,price_list,created_at,updated_at FROM b2b_accounts WHERE merchant_id=${ctx.merchantId} ORDER BY created_at DESC LIMIT 200`);const rules=await db.execute(sql`SELECT id,b2b_account_id,supplier_product_id,minimum_quantity,unit_price_minor,currency,active,created_at,updated_at FROM b2b_price_rules WHERE merchant_id=${ctx.merchantId} ORDER BY created_at DESC LIMIT 500`);res.json({accounts:accounts.rows,priceRules:rules.rows});}catch(e){next(e);}
});
router.post("/merchant/operations/b2b-accounts",async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"team.manage");if(!ctx)return;const company=textValue(req.body?.companyName,1,200),taxId=textValue(req.body?.taxId||"",0,120),terms=integerValue(req.body?.paymentTermsDays??0,0,365),customerId=integerValue(req.body?.customerId,1,2147483647);if(!company||terms==null||!customerId)return fail(res,400,"Company, customer, and valid payment terms are required");if(!(await customerBelongs(ctx.merchantId,customerId)))return fail(res,404,"Customer not found");const id=randomUUID();const result=await db.execute(sql`INSERT INTO b2b_accounts (id,merchant_id,customer_id,company_name,tax_id,status,payment_terms_days) VALUES (${id},${ctx.merchantId},${customerId},${company},${taxId},'pending',${terms}) ON CONFLICT (merchant_id,customer_id) DO NOTHING RETURNING id`);if(!result.rows.length)return fail(res,409,"A B2B account already exists for this customer");await audit(ctx.merchantId,ctx.userId,"b2b.account.created","b2b_account",id);res.status(201).json({id,status:"pending"});}catch(e){next(e);}
});
router.patch("/merchant/operations/b2b-accounts/:id",async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"team.manage");if(!ctx)return;const status=String(req.body?.status||"");if(!["pending","approved","suspended"].includes(status))return fail(res,400,"Invalid B2B account status");const result=await db.execute(sql`UPDATE b2b_accounts SET status=${status},updated_at=now() WHERE id=${req.params.id} AND merchant_id=${ctx.merchantId} RETURNING id,status`);if(!result.rows.length)return fail(res,404,"B2B account not found");await audit(ctx.merchantId,ctx.userId,"b2b.account.status_changed","b2b_account",req.params.id);res.json(result.rows[0]);}catch(e){next(e);}
});
router.post("/merchant/operations/b2b-accounts/:id/price-rules",async(req,res,next)=>{
  try{const ctx=await merchantFor(req,res,"team.manage");if(!ctx)return;const productId=integerValue(req.body?.supplierProductId,1,2147483647), minimum=integerValue(req.body?.minimumQuantity,1,100000000), price=integerValue(req.body?.unitPriceMinor,1,2147483647), currency=textValue(String(req.body?.currency||"USD").toUpperCase(),3,3);if(productId==null||minimum==null||price==null||!currency||!/^[A-Z]{3}$/.test(currency))return fail(res,400,"Invalid B2B price rule");const account=await db.execute(sql`SELECT id FROM b2b_accounts WHERE id=${req.params.id} AND merchant_id=${ctx.merchantId} LIMIT 1`);if(!account.rows.length)return fail(res,404,"B2B account not found");const product=await db.execute(sql`SELECT id FROM supplier_products WHERE id=${productId} AND merchant_id=${ctx.merchantId} LIMIT 1`);if(!product.rows.length)return fail(res,404,"Supplier product not found");const id=randomUUID();const result=await db.execute(sql`INSERT INTO b2b_price_rules (id,merchant_id,b2b_account_id,supplier_product_id,minimum_quantity,unit_price_minor,currency) VALUES (${id},${ctx.merchantId},${req.params.id},${productId},${minimum},${price},${currency}) ON CONFLICT (b2b_account_id,supplier_product_id,minimum_quantity) DO UPDATE SET unit_price_minor=EXCLUDED.unit_price_minor,currency=EXCLUDED.currency,active=true,updated_at=now() RETURNING id`);await audit(ctx.merchantId,ctx.userId,"b2b.price_rule.saved","b2b_price_rule",id);res.status(201).json({id});}catch(e){next(e);}
});

export default router;
