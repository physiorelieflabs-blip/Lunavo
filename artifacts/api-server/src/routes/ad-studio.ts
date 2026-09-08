import { Router, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { writeFile, readFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  db,
  merchantsTable,
  supplierProductsTable,
  adCampaignsTable,
  adCreativesTable,
} from "@workspace/db";
import { planAd } from "../lib/ad-brain";
import { renderProductAd } from "../lib/ad-renderer";

const router = Router();

async function merchantFor(req: Request) {
  const userId = getAuth(req).userId;
  if (!userId) return null;
  return (await db.select().from(merchantsTable).where(eq(merchantsTable.clerkUserId, userId)).limit(1))[0] ?? null;
}
function fail(res: Response, status:number, error:string) { res.status(status).json({error}); }

const VARIANTS = [
  { platform: "reels", aspectRatio:"9:16", width:1080, height:1920, durationSeconds:15 },
  { platform: "shorts", aspectRatio:"9:16", width:1080, height:1920, durationSeconds:15 },
  { platform: "feed", aspectRatio:"1:1", width:1080, height:1080, durationSeconds:15 },
  { platform: "landscape", aspectRatio:"16:9", width:1920, height:1080, durationSeconds:15 },
] as const;

router.get("/ads/generator/campaigns", async (req,res)=>{
  const merchant=await merchantFor(req); if(!merchant)return fail(res,401,"Authentication required");
  const campaigns=await db.select().from(adCampaignsTable).where(eq(adCampaignsTable.merchantId,merchant.id)).orderBy(desc(adCampaignsTable.createdAt)).limit(50);
  const creatives=await db.select({
    id:adCreativesTable.id,campaignId:adCreativesTable.campaignId,productId:adCreativesTable.productId,
    platform:adCreativesTable.platform,aspectRatio:adCreativesTable.aspectRatio,durationSeconds:adCreativesTable.durationSeconds,
    title:adCreativesTable.title,caption:adCreativesTable.caption,hashtags:adCreativesTable.hashtags,status:adCreativesTable.status,
    errorMessage:adCreativesTable.errorMessage,createdAt:adCreativesTable.createdAt,completedAt:adCreativesTable.completedAt
  }).from(adCreativesTable).where(eq(adCreativesTable.merchantId,merchant.id)).orderBy(desc(adCreativesTable.createdAt)).limit(200);
  res.json({campaigns,creatives});
});

router.get("/ads/generator/creatives/:id", async(req,res)=>{
  const merchant=await merchantFor(req); if(!merchant)return fail(res,401,"Authentication required");
  const creative=(await db.select().from(adCreativesTable).where(and(eq(adCreativesTable.id,req.params.id),eq(adCreativesTable.merchantId,merchant.id))).limit(1))[0];
  if(!creative||creative.status!=="completed"||!creative.videoData)return fail(res,404,"Rendered ad creative not found");
  const buffer=Buffer.from(creative.videoData,"base64");
  res.setHeader("Content-Type",creative.mimeType);
  res.setHeader("Content-Length",buffer.length);
  res.setHeader("Content-Disposition",`attachment; filename="ts-commerce-${creative.platform}-${creative.id}.mp4"`);
  res.end(buffer);
});

router.post("/ads/generator/generate", async(req,res)=>{
  const merchant=await merchantFor(req); if(!merchant)return fail(res,401,"Authentication required");
  const productId=Number(req.body?.productId);
  if(!Number.isInteger(productId)||productId<1)return fail(res,400,"Choose a real catalog product");
  const product=(await db.select().from(supplierProductsTable).where(and(eq(supplierProductsTable.id,productId),eq(supplierProductsTable.merchantId,merchant.id))).limit(1))[0];
  if(!product)return fail(res,404,"Product not found");
  if(!product.imageUrl)return fail(res,422,"This product needs a primary image before video generation can start");
  const plan=planAd({
    storeName:merchant.storeName,productTitle:product.title,description:product.description,category:product.category,brand:product.brand,
    price:product.sellingPrice===null?null:Number(product.sellingPrice),currency:product.currency,availability:product.availability,
    sourceCost:product.price===null?null:Number(product.price),audience:req.body?.audience,goal:req.body?.goal,offer:req.body?.offer
  });
  const [campaign]=await db.insert(adCampaignsTable).values({
    merchantId:merchant.id,productId,goal:typeof req.body?.goal==="string"?req.body.goal:"sales",
    audience:typeof req.body?.audience==="string"?req.body.audience.trim():null,
    offer:typeof req.body?.offer==="string"?req.body.offer.trim():null,status:"rendering",
    brainSummary:`Score ${plan.score}/100. ${plan.reasoning.join(' ')}`
  }).returning();
  if(!campaign)return fail(res,500,"Ad campaign could not be created");
  const outputs=[];
  for(const variant of VARIANTS){
    const [creative]=await db.insert(adCreativesTable).values({
      merchantId:merchant.id,campaignId:campaign.id,productId,platform:variant.platform,aspectRatio:variant.aspectRatio,durationSeconds:variant.durationSeconds,
      title:product.title,caption:plan.caption,hashtags:plan.hashtags,script:plan.script,status:"rendering"
    }).returning();
    if(!creative)continue;
    const outPath=path.join(os.tmpdir(),`ts-commerce-${randomUUID()}.mp4`);
    try{
      const buffer=await renderProductAd({imageUrl:product.imageUrl,title:product.title,hook:plan.hook,proof:plan.proof,cta:plan.cta,durationSeconds:variant.durationSeconds,width:variant.width,height:variant.height,outputPath:outPath});
      const [done]=await db.update(adCreativesTable).set({status:"completed",videoData:buffer.toString("base64"),completedAt:new Date(),errorMessage:null}).where(and(eq(adCreativesTable.id,creative.id),eq(adCreativesTable.merchantId,merchant.id))).returning();
      outputs.push({id:done?.id??creative.id,platform:variant.platform,status:"completed",downloadUrl:`/api/ads/generator/creatives/${creative.id}`});
    }catch(error){
      await db.update(adCreativesTable).set({status:"failed",errorMessage:error instanceof Error?error.message:"Renderer failed"}).where(eq(adCreativesTable.id,creative.id));
      outputs.push({id:creative.id,platform:variant.platform,status:"failed"});
    } finally { try{await unlink(outPath);}catch{} }
  }
  await db.update(adCampaignsTable).set({status:outputs.some(o=>o.status==="completed")?"completed":"failed",updatedAt:new Date()}).where(eq(adCampaignsTable.id,campaign.id));
  res.status(201).json({campaignId:campaign.id,productId,brain:plan,creatives:outputs});
});

router.post("/ads/generator/generate-store", async(req,res)=>{
  const merchant=await merchantFor(req); if(!merchant)return fail(res,401,"Authentication required");
  const requestedLimit=Number(req.body?.limit ?? 10);
  const limit=Math.max(1,Math.min(25,Number.isFinite(requestedLimit)?Math.floor(requestedLimit):10));
  const products=await db.select().from(supplierProductsTable)
    .where(and(eq(supplierProductsTable.merchantId,merchant.id),eq(supplierProductsTable.status,"active"),eq(supplierProductsTable.visibility,"active")))
    .orderBy(desc(supplierProductsTable.updatedAt)).limit(limit);
  const results=[];
  for(const product of products){
    if(!product.imageUrl){results.push({productId:product.id,status:"skipped",reason:"missing primary image"});continue;}
    try{
      const plan=planAd({storeName:merchant.storeName,productTitle:product.title,description:product.description,category:product.category,brand:product.brand,price:product.sellingPrice===null?null:Number(product.sellingPrice),currency:product.currency,availability:product.availability,sourceCost:product.price===null?null:Number(product.price),audience:req.body?.audience,goal:req.body?.goal,offer:req.body?.offer});
      const [campaign]=await db.insert(adCampaignsTable).values({merchantId:merchant.id,productId:product.id,goal:typeof req.body?.goal==="string"?req.body.goal:"sales",audience:typeof req.body?.audience==="string"?req.body.audience.trim():null,offer:typeof req.body?.offer==="string"?req.body.offer.trim():null,status:"rendering",brainSummary:`Score ${plan.score}/100. ${plan.reasoning.join(' ')}`}).returning();
      if(!campaign) throw new Error("Campaign could not be created");
      let completed=0;
      for(const variant of VARIANTS){
        const [creative]=await db.insert(adCreativesTable).values({merchantId:merchant.id,campaignId:campaign.id,productId:product.id,platform:variant.platform,aspectRatio:variant.aspectRatio,durationSeconds:variant.durationSeconds,title:product.title,caption:plan.caption,hashtags:plan.hashtags,script:plan.script,status:"rendering"}).returning();
        if(!creative)continue;
        const outPath=path.join(os.tmpdir(),`ts-commerce-${randomUUID()}.mp4`);
        try{
          const buffer=await renderProductAd({imageUrl:product.imageUrl,title:product.title,hook:plan.hook,proof:plan.proof,cta:plan.cta,durationSeconds:variant.durationSeconds,width:variant.width,height:variant.height,outputPath:outPath});
          await db.update(adCreativesTable).set({status:"completed",videoData:buffer.toString("base64"),completedAt:new Date(),errorMessage:null}).where(eq(adCreativesTable.id,creative.id));
          completed++;
        }catch(error){await db.update(adCreativesTable).set({status:"failed",errorMessage:error instanceof Error?error.message:"Renderer failed"}).where(eq(adCreativesTable.id,creative.id));}
        finally{try{await unlink(outPath);}catch{}}
      }
      await db.update(adCampaignsTable).set({status:completed?"completed":"failed",updatedAt:new Date()}).where(eq(adCampaignsTable.id,campaign.id));
      results.push({productId:product.id,campaignId:campaign.id,status:completed?"completed":"failed",variantsCompleted:completed});
    }catch(error){results.push({productId:product.id,status:"failed",reason:error instanceof Error?error.message:"generation failed"});}
  }
  res.status(201).json({requested:products.length,processed:results.length,results});
});

export default router;

export default router;
