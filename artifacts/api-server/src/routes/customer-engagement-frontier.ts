import { Router, type Request, type Response } from "express";
import { and, eq, or, sql } from "drizzle-orm";
import { db, merchantsTable } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { requirePermission } from "../lib/tenant-access";

const router = Router();
const txt=(v:unknown,max:number)=>typeof v==="string"?v.trim().slice(0,max):"";
const visitor=(v:unknown)=>/^[A-Za-z0-9._:-]{8,120}$/.test(txt(v,120))?txt(v,120):null;

async function store(keyValue:unknown){
  const key=txt(keyValue,120); if(!key)return null;
  const [m]=await db.select({id:merchantsTable.id,publicStoreKey:merchantsTable.publicStoreKey})
    .from(merchantsTable).where(and(eq(merchantsTable.publicStoreKey,key),eq(merchantsTable.status,"active"))).limit(1);
  return m??null;
}
async function merchant(req:Request,res:Response){
  const userId=getAuth(req).userId; if(!userId){res.status(401).json({error:"Authentication required"});return null;}
  const [m]=await db.select({id:merchantsTable.id}).from(merchantsTable).where(and(eq(merchantsTable.status,"active"),or(eq(merchantsTable.localAuthUserId,userId),eq(merchantsTable.clerkUserId,userId)))).limit(1);
  if(!m){res.status(404).json({error:"Merchant workspace not found"});return null;}
  try{await requirePermission(userId,m.id,"team.manage");}catch{res.status(403).json({error:"Permission required"});return null;}
  return m;
}
async function productId(merchantId:number,v:unknown){
  const id=Number(v); if(!Number.isSafeInteger(id)||id<1)return null;
  const r=await db.execute(sql`SELECT id,title FROM supplier_products WHERE merchant_id=${merchantId} AND status='active' AND id=${id} LIMIT 1`);
  return r.rows[0]??null;
}

router.post("/public/store/:merchantKey/engagement/view",async(req,res)=>{
  const m=await store(req.params.merchantKey); if(!m)return res.status(404).json({error:"Store not found"});
  const k=visitor(req.body?.visitorKey), p=await productId(m.id,req.body?.productId);
  if(!k||!p)return res.status(400).json({error:"Visitor key and active product are required"});
  await db.execute(sql`INSERT INTO customer_recently_viewed(merchant_id,visitor_key,supplier_product_id) VALUES(${m.id},${k},${Number(p.id)}) ON CONFLICT(merchant_id,visitor_key,supplier_product_id) DO UPDATE SET view_count=customer_recently_viewed.view_count+1,last_viewed_at=now()`);
  return res.status(204).end();
});

router.get("/public/store/:merchantKey/engagement/recent",async(req,res)=>{
  const m=await store(req.params.merchantKey); if(!m)return res.status(404).json({error:"Store not found"});
  const k=visitor(req.query.visitorKey); if(!k)return res.status(400).json({error:"Valid visitorKey is required"});
  const r=await db.execute(sql`SELECT rv.supplier_product_id AS "productId",sp.title,rv.view_count AS "viewCount",rv.last_viewed_at AS "lastViewedAt" FROM customer_recently_viewed rv JOIN supplier_products sp ON sp.id=rv.supplier_product_id AND sp.merchant_id=rv.merchant_id WHERE rv.merchant_id=${m.id} AND rv.visitor_key=${k} AND sp.status='active' ORDER BY rv.last_viewed_at DESC LIMIT 30`);
  return res.json({products:r.rows});
});

router.post("/public/store/:merchantKey/engagement/wishlist",async(req,res)=>{
  const m=await store(req.params.merchantKey); if(!m)return res.status(404).json({error:"Store not found"});
  const k=visitor(req.body?.visitorKey), p=await productId(m.id,req.body?.productId);
  if(!k||!p)return res.status(400).json({error:"Visitor key and active product are required"});
  await db.execute(sql`INSERT INTO customer_wishlist_visitors(merchant_id,visitor_key,supplier_product_id) VALUES(${m.id},${k},${Number(p.id)}) ON CONFLICT(merchant_id,visitor_key,supplier_product_id) DO NOTHING`);
  return res.status(201).json({saved:true});
});

router.delete("/public/store/:merchantKey/engagement/wishlist",async(req,res)=>{
  const m=await store(req.params.merchantKey); if(!m)return res.status(404).json({error:"Store not found"});
  const k=visitor(req.body?.visitorKey), p=await productId(m.id,req.body?.productId);
  if(!k||!p)return res.status(400).json({error:"Visitor key and active product are required"});
  await db.execute(sql`DELETE FROM customer_wishlist_visitors WHERE merchant_id=${m.id} AND visitor_key=${k} AND supplier_product_id=${Number(p.id)}`);
  return res.status(204).end();
});

router.get("/public/store/:merchantKey/engagement/wishlist",async(req,res)=>{
  const m=await store(req.params.merchantKey); if(!m)return res.status(404).json({error:"Store not found"});
  const k=visitor(req.query.visitorKey); if(!k)return res.status(400).json({error:"Valid visitorKey is required"});
  const r=await db.execute(sql`SELECT wl.supplier_product_id AS "productId",sp.title,wl.created_at AS "savedAt" FROM customer_wishlist_visitors wl JOIN supplier_products sp ON sp.id=wl.supplier_product_id AND sp.merchant_id=wl.merchant_id WHERE wl.merchant_id=${m.id} AND wl.visitor_key=${k} AND sp.status='active' ORDER BY wl.created_at DESC LIMIT 100`);
  return res.json({products:r.rows});
});

router.post("/public/store/:merchantKey/alerts/stock",async(req,res)=>{
  const m=await store(req.params.merchantKey); if(!m)return res.status(404).json({error:"Store not found"});
  const k=visitor(req.body?.visitorKey), p=await productId(m.id,req.body?.productId);
  if(!k||!p)return res.status(400).json({error:"Visitor key and active product are required"});
  await db.execute(sql`INSERT INTO customer_stock_watches(merchant_id,visitor_key,supplier_product_id,active) VALUES(${m.id},${k},${Number(p.id)},true) ON CONFLICT(merchant_id,visitor_key,supplier_product_id) DO UPDATE SET active=true,triggered_at=NULL`);
  return res.status(201).json({watching:true});
});

router.post("/public/store/:merchantKey/product-questions",async(req,res)=>{
  const m=await store(req.params.merchantKey); if(!m)return res.status(404).json({error:"Store not found"});
  const k=visitor(req.body?.visitorKey), p=await productId(m.id,req.body?.productId), q=txt(req.body?.question,1000);
  if(!k||!p||q.length<5)return res.status(400).json({error:"Visitor, active product and a meaningful question are required"});
  const r=await db.execute(sql`INSERT INTO product_questions(merchant_id,supplier_product_id,visitor_key,question) VALUES(${m.id},${Number(p.id)},${k},${q}) RETURNING id,question,status,created_at AS "createdAt"`);
  return res.status(201).json({question:r.rows[0]});
});

router.get("/public/store/:merchantKey/product-questions",async(req,res)=>{
  const m=await store(req.params.merchantKey); if(!m)return res.status(404).json({error:"Store not found"});
  const p=await productId(m.id,req.query.productId); if(!p)return res.status(400).json({error:"Active product is required"});
  const r=await db.execute(sql`SELECT id,question,answer,created_at AS "createdAt",answered_at AS "answeredAt" FROM product_questions WHERE merchant_id=${m.id} AND supplier_product_id=${Number(p.id)} AND status='answered' ORDER BY answered_at DESC NULLS LAST,created_at DESC LIMIT 100`);
  return res.json({questions:r.rows});
});

router.get("/merchant/product-questions",async(req,res)=>{
  const m=await merchant(req,res); if(!m)return;
  const status=txt(req.query.status,20);
  const r=status?await db.execute(sql`SELECT id,supplier_product_id AS "productId",question,answer,status,created_at AS "createdAt" FROM product_questions WHERE merchant_id=${m.id} AND status=${status} ORDER BY created_at DESC LIMIT 250`):await db.execute(sql`SELECT id,supplier_product_id AS "productId",question,answer,status,created_at AS "createdAt" FROM product_questions WHERE merchant_id=${m.id} ORDER BY created_at DESC LIMIT 250`);
  return res.json({questions:r.rows});
});

router.post("/merchant/product-questions/:id/answer",async(req,res)=>{
  const m=await merchant(req,res); if(!m)return;
  const id=txt(req.params.id,60), answer=txt(req.body?.answer,2000);
  if(!/^[0-9a-fA-F-]{20,60}$/.test(id)||answer.length<2)return res.status(400).json({error:"Valid question and answer are required"});
  const r=await db.execute(sql`UPDATE product_questions SET answer=${answer},status='answered',answered_by=${getAuth(req).userId},answered_at=now(),updated_at=now() WHERE id=${id} AND merchant_id=${m.id} AND status='pending' RETURNING id,status,answer,answered_at AS "answeredAt"`);
  if(!r.rows.length)return res.status(404).json({error:"Pending question not found"});
  return res.json({question:r.rows[0]});
});

router.post("/merchant/product-questions/:id/reject",async(req,res)=>{
  const m=await merchant(req,res); if(!m)return;
  const id=txt(req.params.id,60);
  if(!/^[0-9a-fA-F-]{20,60}$/.test(id))return res.status(400).json({error:"Invalid question id"});
  const r=await db.execute(sql`UPDATE product_questions SET status='rejected',updated_at=now() WHERE id=${id} AND merchant_id=${m.id} AND status='pending' RETURNING id,status`);
  if(!r.rows.length)return res.status(404).json({error:"Pending question not found"});
  return res.json({question:r.rows[0]});
});

export default router;
