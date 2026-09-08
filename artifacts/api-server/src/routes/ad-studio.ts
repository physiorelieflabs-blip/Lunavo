import { Router, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { db, merchantsTable, supplierProductsTable, adCampaignsTable, adCreativesTable, adMediaAssetsTable } from "@workspace/db";
import { planAdWithBrain } from "../lib/ad-brain";
import { renderProductAd } from "../lib/ad-renderer";

const router = Router();
const generationLocks = new Set<number>();
const storeGenerationLocks = new Set<number>();
const MAX_VIDEO_BYTES = 12 * 1024 * 1024;
const MAX_CUSTOM_MEDIA_BYTES = 25 * 1024 * 1024;
const MAX_STORE_PRODUCTS = 10;
const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]);

async function merchantFor(req: Request) {
  const userId = getAuth(req).userId;
  if (!userId) return null;
  return (await db.select().from(merchantsTable).where(eq(merchantsTable.clerkUserId, userId)).limit(1))[0] ?? null;
}
function fail(res: Response, status: number, error: string) { res.status(status).json({ error }); }

function parseCustomMedia(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const filename = typeof input.filename === "string" ? input.filename.trim().replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) : "";
  const mimeType = typeof input.mimeType === "string" ? input.mimeType.toLowerCase().trim() : "";
  const data = typeof input.data === "string" ? input.data : "";
  if (!filename || !ALLOWED_MEDIA.has(mimeType) || !data.startsWith(`data:${mimeType};base64,`)) return null;
  const encoded = data.slice(data.indexOf(",") + 1);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) return null;
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > MAX_CUSTOM_MEDIA_BYTES) return null;
  const isVideo = mimeType.startsWith("video/");
  const extension = filename.toLowerCase().split(".").pop();
  const expected = isVideo ? (mimeType === "video/mp4" ? "mp4" : "webm") : ({ "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif" } as Record<string,string>)[mimeType];
  if (!extension || extension !== expected) return null;
  if (!isVideo && mimeType === "image/png" && !bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return null;
  if (!isVideo && mimeType === "image/jpeg" && !(bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff)) return null;
  if (!isVideo && mimeType === "image/gif" && !["GIF87a","GIF89a"].includes(bytes.subarray(0,6).toString("ascii"))) return null;
  if (!isVideo && mimeType === "image/webp" && (bytes.subarray(0,4).toString("ascii") !== "RIFF" || bytes.subarray(8,12).toString("ascii") !== "WEBP")) return null;
  return { filename, mimeType, bytes, mediaType: isVideo ? "video" : "image" };
}

router.get("/ads/generator/campaigns", async (req, res): Promise<void> => {
  const merchant = await merchantFor(req); if (!merchant) { fail(res, 401, "Authentication required"); return; }
  const campaigns = await db.select().from(adCampaignsTable).where(eq(adCampaignsTable.merchantId, merchant.id)).orderBy(desc(adCampaignsTable.createdAt)).limit(50);
  const creatives = await db.select({ id: adCreativesTable.id, campaignId: adCreativesTable.campaignId, productId: adCreativesTable.productId, platform: adCreativesTable.platform, aspectRatio: adCreativesTable.aspectRatio, durationSeconds: adCreativesTable.durationSeconds, title: adCreativesTable.title, caption: adCreativesTable.caption, hashtags: adCreativesTable.hashtags, status: adCreativesTable.status, errorMessage: adCreativesTable.errorMessage, createdAt: adCreativesTable.createdAt, completedAt: adCreativesTable.completedAt }).from(adCreativesTable).where(eq(adCreativesTable.merchantId, merchant.id)).orderBy(desc(adCreativesTable.createdAt)).limit(200);
  const customMedia = await db.select({ id: adMediaAssetsTable.id, filename: adMediaAssetsTable.filename, mimeType: adMediaAssetsTable.mimeType, mediaType: adMediaAssetsTable.mediaType, byteSize: adMediaAssetsTable.byteSize, createdAt: adMediaAssetsTable.createdAt }).from(adMediaAssetsTable).where(eq(adMediaAssetsTable.merchantId, merchant.id)).orderBy(desc(adMediaAssetsTable.createdAt)).limit(100);
  res.json({ campaigns, creatives, customMedia });
});

router.post("/ads/media", async (req, res): Promise<void> => {
  const merchant = await merchantFor(req); if (!merchant) { fail(res, 401, "Authentication required"); return; }
  const parsed = parseCustomMedia(req.body?.media);
  if (!parsed) { fail(res, 400, "Upload a supported image or MP4/WebM video up to 25 MB with a matching filename"); return; }
  const [asset] = await db.insert(adMediaAssetsTable).values({ merchantId: merchant.id, filename: parsed.filename, mimeType: parsed.mimeType, mediaType: parsed.mediaType, byteSize: parsed.bytes.length, mediaData: `data:${parsed.mimeType};base64,${parsed.bytes.toString("base64")}` }).returning({ id: adMediaAssetsTable.id, filename: adMediaAssetsTable.filename, mimeType: adMediaAssetsTable.mimeType, mediaType: adMediaAssetsTable.mediaType, byteSize: adMediaAssetsTable.byteSize, createdAt: adMediaAssetsTable.createdAt });
  if (!asset) { fail(res, 500, "Media could not be saved"); return; }
  res.status(201).json({ asset, downloadUrl: `/api/ads/media/${asset.id}/download` });
});

router.get("/ads/media/:id/download", async (req, res): Promise<void> => {
  const merchant = await merchantFor(req); if (!merchant) { fail(res, 401, "Authentication required"); return; }
  const [asset] = await db.select().from(adMediaAssetsTable).where(and(eq(adMediaAssetsTable.id, req.params.id), eq(adMediaAssetsTable.merchantId, merchant.id))).limit(1);
  if (!asset) { fail(res, 404, "Ad media not found"); return; }
  const comma = asset.mediaData.indexOf(",");
  const buffer = Buffer.from(comma >= 0 ? asset.mediaData.slice(comma + 1) : asset.mediaData, "base64");
  res.setHeader("Content-Type", asset.mimeType); res.setHeader("Content-Length", String(buffer.length)); res.setHeader("Content-Disposition", `attachment; filename="${asset.filename}"`); res.end(buffer);
});

router.get("/ads/generator/creatives/:id", async (req, res): Promise<void> => {
  const merchant = await merchantFor(req); if (!merchant) { fail(res, 401, "Authentication required"); return; }
  const creative = (await db.select().from(adCreativesTable).where(and(eq(adCreativesTable.id, req.params.id), eq(adCreativesTable.merchantId, merchant.id))).limit(1))[0];
  if (!creative || creative.status !== "completed" || !creative.videoData) { fail(res, 404, "Rendered ad creative not found"); return; }
  const buffer = Buffer.from(creative.videoData, "base64");
  res.setHeader("Content-Type", creative.mimeType); res.setHeader("Content-Length", String(buffer.length)); res.setHeader("Content-Disposition", `attachment; filename="ts-commerce-${creative.platform}-${creative.id}.mp4"`); res.end(buffer);
});

router.post("/ads/generator/generate", async (req, res): Promise<void> => {
  const merchant = await merchantFor(req); if (!merchant) { fail(res, 401, "Authentication required"); return; }
  const productId = Number(req.body?.productId); if (!Number.isInteger(productId) || productId < 1) { fail(res, 400, "Choose a real catalog product"); return; }
  const product = (await db.select().from(supplierProductsTable).where(and(eq(supplierProductsTable.id, productId), eq(supplierProductsTable.merchantId, merchant.id))).limit(1))[0];
  if (!product) { fail(res, 404, "Product not found"); return; }
  if (!product.imageUrl) { fail(res, 422, "This product needs a primary image before video generation can start"); return; }
  if (generationLocks.has(productId)) { fail(res, 409, "This product is already being rendered. Please use the existing creative once it finishes."); return; }
  generationLocks.add(productId);
  try {
    const plan = await planAdWithBrain({ storeName: merchant.storeName, productTitle: product.title, description: product.description, category: product.category, brand: product.brand, price: product.sellingPrice === null ? null : Number(product.sellingPrice), currency: product.currency, availability: product.availability, sourceCost: product.price === null ? null : Number(product.price), audience: req.body?.audience, goal: req.body?.goal, offer: req.body?.offer, customPrompt: req.body?.customPrompt });
    const [campaign] = await db.insert(adCampaignsTable).values({ merchantId: merchant.id, productId, goal: typeof req.body?.goal === "string" ? req.body.goal : "sales", audience: typeof req.body?.audience === "string" ? req.body.audience.trim() : null, offer: typeof req.body?.offer === "string" ? req.body.offer.trim() : null, status: "rendering", brainSummary: `Score ${plan.score}/100. ${plan.reasoning.join(" ")}` }).returning();
    if (!campaign) { fail(res, 500, "Ad campaign could not be created"); return; }
    const outputs: Array<{id:string;platform:string;status:string;downloadUrl?:string}> = [];
    for (const variant of VARIANTS) {
      const [creative] = await db.insert(adCreativesTable).values({ merchantId: merchant.id, campaignId: campaign.id, productId, platform: variant.platform, aspectRatio: variant.aspectRatio, durationSeconds: variant.durationSeconds, title: product.title, caption: plan.caption, hashtags: plan.hashtags, script: plan.script, status: "rendering" }).returning();
      if (!creative) continue;
      const outPath = path.join(os.tmpdir(), `ts-commerce-${randomUUID()}.mp4`);
      try { const buffer = await renderProductAd({ imageUrl: product.imageUrl, title: product.title, hook: plan.hook, proof: plan.proof, cta: plan.cta, durationSeconds: variant.durationSeconds, width: variant.width, height: variant.height, outputPath: outPath }); if (buffer.byteLength > MAX_VIDEO_BYTES) throw new Error("Rendered advertisement exceeded the 12 MB storage limit"); const [done] = await db.update(adCreativesTable).set({ status:"completed", videoData:buffer.toString("base64"), completedAt:new Date(), errorMessage:null }).where(and(eq(adCreativesTable.id,creative.id),eq(adCreativesTable.merchantId,merchant.id))).returning(); outputs.push({id:done?.id??creative.id,platform:variant.platform,status:"completed",downloadUrl:`/api/ads/generator/creatives/${creative.id}`}); } catch(error) { await db.update(adCreativesTable).set({status:"failed",errorMessage:error instanceof Error?error.message:"Renderer failed"}).where(and(eq(adCreativesTable.id,creative.id),eq(adCreativesTable.merchantId,merchant.id))); outputs.push({id:creative.id,platform:variant.platform,status:"failed"}); } finally { try{await unlink(outPath);}catch{} }
    }
    await db.update(adCampaignsTable).set({status:outputs.some(o=>o.status==='completed')?'completed':'failed',updatedAt:new Date()}).where(and(eq(adCampaignsTable.id,campaign.id),eq(adCampaignsTable.merchantId,merchant.id)));
    res.status(201).json({campaignId:campaign.id,productId,brain:plan,creatives:outputs});
  } catch(error) { fail(res,500,error instanceof Error?error.message:"Ad generation failed"); } finally { generationLocks.delete(productId); }
});

router.post("/ads/generator/generate-store", async(req,res):Promise<void>=>{
  const merchant=await merchantFor(req);if(!merchant){fail(res,401,"Authentication required");return;}if(storeGenerationLocks.has(merchant.id)){fail(res,409,"A store-wide ad generation job is already running for this merchant.");return;}storeGenerationLocks.add(merchant.id);
  try{const products=await db.select().from(supplierProductsTable).where(and(eq(supplierProductsTable.merchantId,merchant.id),eq(supplierProductsTable.status,"active"),eq(supplierProductsTable.visibility,"active"))).orderBy(desc(supplierProductsTable.updatedAt)).limit(MAX_STORE_PRODUCTS);const results=[];
    for(const product of products){if(!product.imageUrl){results.push({productId:product.id,status:"skipped",reason:"missing primary image"});continue;}try{const plan=await planAdWithBrain({storeName:merchant.storeName,productTitle:product.title,description:product.description,category:product.category,brand:product.brand,price:product.sellingPrice===null?null:Number(product.sellingPrice),currency:product.currency,availability:product.availability,sourceCost:product.price===null?null:Number(product.price),audience:req.body?.audience,goal:req.body?.goal,offer:req.body?.offer,customPrompt:req.body?.customPrompt});const [campaign]=await db.insert(adCampaignsTable).values({merchantId:merchant.id,productId:product.id,goal:typeof req.body?.goal==='string'?req.body.goal:'sales',audience:typeof req.body?.audience==='string'?req.body.audience.trim():null,offer:typeof req.body?.offer==='string'?req.body.offer.trim():null,status:'rendering',brainSummary:`Score ${plan.score}/100. ${plan.reasoning.join(' ')}`}).returning();if(!campaign)throw new Error('Campaign could not be created');let completed=0;for(const variant of VARIANTS){const [creative]=await db.insert(adCreativesTable).values({merchantId:merchant.id,campaignId:campaign.id,productId:product.id,platform:variant.platform,aspectRatio:variant.aspectRatio,durationSeconds:variant.durationSeconds,title:product.title,caption:plan.caption,hashtags:plan.hashtags,script:plan.script,status:'rendering'}).returning();if(!creative)continue;const outPath=path.join(os.tmpdir(),`ts-commerce-${randomUUID()}.mp4`);try{const buffer=await renderProductAd({imageUrl:product.imageUrl,title:product.title,hook:plan.hook,proof:plan.proof,cta:plan.cta,durationSeconds:variant.durationSeconds,width:variant.width,height:variant.height,outputPath:outPath});if(buffer.byteLength>MAX_VIDEO_BYTES)throw new Error('Rendered advertisement exceeded the 12 MB storage limit');await db.update(adCreativesTable).set({status:'completed',videoData:buffer.toString('base64'),completedAt:new Date(),errorMessage:null}).where(and(eq(adCreativesTable.id,creative.id),eq(adCreativesTable.merchantId,merchant.id)));completed++;}catch(error){await db.update(adCreativesTable).set({status:'failed',errorMessage:error instanceof Error?error.message:'Renderer failed'}).where(and(eq(adCreativesTable.id,creative.id),eq(adCreativesTable.merchantId,merchant.id)));}finally{try{await unlink(outPath);}catch{}}}await db.update(adCampaignsTable).set({status:completed?'completed':'failed',updatedAt:new Date()}).where(and(eq(adCampaignsTable.id,campaign.id),eq(adCampaignsTable.merchantId,merchant.id)));results.push({productId:product.id,campaignId:campaign.id,status:completed?'completed':'failed',variantsCompleted:completed});}catch(error){results.push({productId:product.id,status:'failed',reason:error instanceof Error?error.message:'generation failed'});}}
    res.status(201).json({requested:products.length,processed:results.length,results});
  }catch(error){fail(res,500,error instanceof Error?error.message:'Store-wide ad generation failed');}finally{storeGenerationLocks.delete(merchant.id);}
});

router.post("/ads/generator/stitch", async(req,res):Promise<void>=>{const merchant=await merchantFor(req);if(!merchant){fail(res,401,"Authentication required");return;}const rawIds=Array.isArray(req.body?.creativeIds)?req.body.creativeIds:[];const creativeIds=rawIds.filter((value:unknown):value is string=>typeof value==='string'&&value.length>0).slice(0,20);if(creativeIds.length<2){fail(res,400,"Choose at least two completed video clips to stitch");return;}const creatives=await db.select().from(adCreativesTable).where(and(eq(adCreativesTable.merchantId,merchant.id),eq(adCreativesTable.status,'completed')));const selected: Array<typeof creatives[number]> = creativeIds.map((id:string)=>creatives.find((creative:typeof creatives[number])=>creative.id===id)).filter((item):item is typeof creatives[number]=>Boolean(item));if(selected.length!==creativeIds.length){fail(res,404,"One or more video clips are unavailable");return;}const first=selected[0]!;if(selected.some((creative:typeof creatives[number])=>creative.aspectRatio!==first.aspectRatio)){fail(res,422,"Stitch clips with the same aspect ratio");return;}const work=await (await import('node:fs/promises')).mkdtemp(path.join(os.tmpdir(),'ts-commerce-stitch-'));const inputPaths:string[]=[];const outputPath=path.join(work,`stitched-${randomUUID()}.mp4`);try{const {writeFile:write,readFile:read,rm}=await import('node:fs/promises');for(const [index,creative] of selected.entries()){const inputPath=path.join(work,`clip-${index}.mp4`);await write(inputPath,Buffer.from(creative.videoData!,'base64'));inputPaths.push(inputPath);}const inputArgs=inputPaths.flatMap((inputPath)=>['-i',inputPath]);const transition=0.6;const durations=selected.map((creative:typeof creatives[number])=>creative.durationSeconds);const filterParts:string[]=[];let cumulative=durations[0]!;filterParts.push('[0:v]setpts=PTS-STARTPTS[v0]');for(let i=1;i<selected.length;i++){filterParts.push(`[${i}:v]setpts=PTS-STARTPTS[v${i}]`);const offset=Math.max(0,cumulative-transition*i);filterParts.push(`[v${i-1}][v${i}]xfade=transition=fade:duration=${transition}:offset=${offset}[x${i}]`);cumulative+=durations[i]!-transition;}const finalLabel=`x${selected.length-1}`;const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');await promisify(execFile)('ffmpeg',['-y','-hide_banner','-loglevel','error',...inputArgs,'-filter_complex',filterParts.join(';'),'-map',`[${finalLabel}]`,'-an','-c:v','libx264','-preset',process.env.TS_AD_FFMPEG_PRESET||'veryfast','-crf',process.env.TS_AD_FFMPEG_CRF||'25','-pix_fmt','yuv420p','-movflags','+faststart',outputPath]);const buffer=await read(outputPath);if(buffer.byteLength>100*1024*1024)throw new Error('Stitched video exceeded the 100 MB export limit');res.setHeader('Content-Type','video/mp4');res.setHeader('Content-Length',String(buffer.length));res.setHeader('Content-Disposition',`attachment; filename="ts-commerce-long-ad-${randomUUID()}.mp4"`);res.end(buffer);}catch(error){fail(res,500,error instanceof Error?error.message:'Video stitching failed');}finally{const {rm}=await import('node:fs/promises');await rm(work,{recursive:true,force:true});}});

export default router;
