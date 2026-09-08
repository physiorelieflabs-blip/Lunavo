import { Router, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { writeFile, readFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { db, merchantsTable, supplierProductsTable, adCampaignsTable, adCreativesTable } from "@workspace/db";
import { planAd } from "../lib/ad-brain";
import { renderProductAd } from "../lib/ad-renderer";

const router = Router();
const generationLocks = new Set<number>();
const storeGenerationLocks = new Set<number>();
const MAX_VIDEO_BYTES = 12 * 1024 * 1024;
const MAX_STORE_PRODUCTS = 10;

async function merchantFor(req: Request) {
  const userId = getAuth(req).userId;
  if (!userId) return null;
  return (await db.select().from(merchantsTable).where(eq(merchantsTable.clerkUserId, userId)).limit(1))[0] ?? null;
}
function fail(res: Response, status: number, error: string) { res.status(status).json({ error }); }

const VARIANTS = [
  { platform: "reels", aspectRatio: "9:16", width: 1080, height: 1920, durationSeconds: 15 },
  { platform: "shorts", aspectRatio: "9:16", width: 1080, height: 1920, durationSeconds: 15 },
  { platform: "feed", aspectRatio: "1:1", width: 1080, height: 1080, durationSeconds: 15 },
  { platform: "landscape", aspectRatio: "16:9", width: 1920, height: 1080, durationSeconds: 15 },
] as const;

router.get("/ads/generator/campaigns", async (req, res): Promise<void> => {
  const merchant = await merchantFor(req); if (!merchant) { fail(res, 401, "Authentication required"); return; }
  const campaigns = await db.select().from(adCampaignsTable).where(eq(adCampaignsTable.merchantId, merchant.id)).orderBy(desc(adCampaignsTable.createdAt)).limit(50);
  const creatives = await db.select({
    id: adCreativesTable.id, campaignId: adCreativesTable.campaignId, productId: adCreativesTable.productId,
    platform: adCreativesTable.platform, aspectRatio: adCreativesTable.aspectRatio, durationSeconds: adCreativesTable.durationSeconds,
    title: adCreativesTable.title, caption: adCreativesTable.caption, hashtags: adCreativesTable.hashtags, status: adCreativesTable.status,
    errorMessage: adCreativesTable.errorMessage, createdAt: adCreativesTable.createdAt, completedAt: adCreativesTable.completedAt,
  }).from(adCreativesTable).where(eq(adCreativesTable.merchantId, merchant.id)).orderBy(desc(adCreativesTable.createdAt)).limit(200);
  res.json({ campaigns, creatives });
});

router.get("/ads/generator/creatives/:id", async (req, res): Promise<void> => {
  const merchant = await merchantFor(req); if (!merchant) { fail(res, 401, "Authentication required"); return; }
  const creative = (await db.select().from(adCreativesTable).where(and(eq(adCreativesTable.id, req.params.id), eq(adCreativesTable.merchantId, merchant.id))).limit(1))[0];
  if (!creative || creative.status !== "completed" || !creative.videoData) { fail(res, 404, "Rendered ad creative not found"); return; }
  const buffer = Buffer.from(creative.videoData, "base64");
  res.setHeader("Content-Type", creative.mimeType);
  res.setHeader("Content-Length", String(buffer.length));
  res.setHeader("Content-Disposition", `attachment; filename="ts-commerce-${creative.platform}-${creative.id}.mp4"`);
  res.end(buffer);
});

router.post("/ads/generator/generate", async (req, res): Promise<void> => {
  const merchant = await merchantFor(req); if (!merchant) { fail(res, 401, "Authentication required"); return; }
  const productId = Number(req.body?.productId);
  if (!Number.isInteger(productId) || productId < 1) { fail(res, 400, "Choose a real catalog product"); return; }
  const product = (await db.select().from(supplierProductsTable).where(and(eq(supplierProductsTable.id, productId), eq(supplierProductsTable.merchantId, merchant.id))).limit(1))[0];
  if (!product) { fail(res, 404, "Product not found"); return; }
  if (!product.imageUrl) { fail(res, 422, "This product needs a primary image before video generation can start"); return; }
  if (generationLocks.has(productId)) { fail(res, 409, "This product is already being rendered. Please use the existing creative once it finishes."); return; }
  generationLocks.add(productId);
  const plan = planAd({
    storeName: merchant.storeName, productTitle: product.title, description: product.description, category: product.category, brand: product.brand,
    price: product.sellingPrice === null ? null : Number(product.sellingPrice), currency: product.currency, availability: product.availability,
    sourceCost: product.price === null ? null : Number(product.price), audience: req.body?.audience, goal: req.body?.goal, offer: req.body?.offer,
  });
  try {
    const [campaign] = await db.insert(adCampaignsTable).values({
      merchantId: merchant.id, productId, goal: typeof req.body?.goal === "string" ? req.body.goal : "sales",
      audience: typeof req.body?.audience === "string" ? req.body.audience.trim() : null,
      offer: typeof req.body?.offer === "string" ? req.body.offer.trim() : null, status: "rendering",
      brainSummary: `Score ${plan.score}/100. ${plan.reasoning.join(" ")}`,
    }).returning();
    if (!campaign) { fail(res, 500, "Ad campaign could not be created"); return; }
    const outputs: Array<{id:string;platform:string;status:string;downloadUrl?:string}> = [];
    for (const variant of VARIANTS) {
      const [creative] = await db.insert(adCreativesTable).values({
        merchantId: merchant.id, campaignId: campaign.id, productId, platform: variant.platform, aspectRatio: variant.aspectRatio,
        durationSeconds: variant.durationSeconds, title: product.title, caption: plan.caption, hashtags: plan.hashtags, script: plan.script, status: "rendering",
      }).returning();
      if (!creative) continue;
      const outPath = path.join(os.tmpdir(), `ts-commerce-${randomUUID()}.mp4`);
      try {
        const buffer = await renderProductAd({ imageUrl: product.imageUrl, title: product.title, hook: plan.hook, proof: plan.proof, cta: plan.cta,
          durationSeconds: variant.durationSeconds, width: variant.width, height: variant.height, outputPath: outPath });
        if (buffer.byteLength > MAX_VIDEO_BYTES) throw new Error("Rendered advertisement exceeded the 12 MB storage limit");
        const [done] = await db.update(adCreativesTable).set({ status: "completed", videoData: buffer.toString("base64"), completedAt: new Date(), errorMessage: null })
          .where(and(eq(adCreativesTable.id, creative.id), eq(adCreativesTable.merchantId, merchant.id))).returning();
        outputs.push({ id: done?.id ?? creative.id, platform: variant.platform, status: "completed", downloadUrl: `/api/ads/generator/creatives/${creative.id}` });
      } catch (error) {
        await db.update(adCreativesTable).set({ status: "failed", errorMessage: error instanceof Error ? error.message : "Renderer failed" })
          .where(and(eq(adCreativesTable.id, creative.id), eq(adCreativesTable.merchantId, merchant.id)));
        outputs.push({ id: creative.id, platform: variant.platform, status: "failed" });
      } finally { try { await unlink(outPath); } catch {} }
    }
    await db.update(adCampaignsTable).set({ status: outputs.some(o => o.status === "completed") ? "completed" : "failed", updatedAt: new Date() })
      .where(and(eq(adCampaignsTable.id, campaign.id), eq(adCampaignsTable.merchantId, merchant.id)));
    res.status(201).json({ campaignId: campaign.id, productId, brain: plan, creatives: outputs });
  } catch (error) {
    await db.update(adCampaignsTable).set({ status: "failed", updatedAt: new Date(), brainSummary: `${plan.reasoning.join(" ")} Generation failed: ${error instanceof Error ? error.message : "unknown error"}` })
      .where(and(eq(adCampaignsTable.merchantId, merchant.id), eq(adCampaignsTable.status, "rendering"), eq(adCampaignsTable.productId, productId)));
    fail(res, 500, error instanceof Error ? error.message : "Ad generation failed");
  } finally {
    generationLocks.delete(productId);
  }
});

router.post("/ads/generator/generate-store", async (req, res): Promise<void> => {
  const merchant = await merchantFor(req); if (!merchant) { fail(res, 401, "Authentication required"); return; }
  if (storeGenerationLocks.has(merchant.id)) { fail(res, 409, "A store-wide ad generation job is already running for this merchant."); return; }
  storeGenerationLocks.add(merchant.id);
  const requestedLimit = Number(req.body?.limit ?? MAX_STORE_PRODUCTS);
  const limit = Math.max(1, Math.min(MAX_STORE_PRODUCTS, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : MAX_STORE_PRODUCTS));
  try {
    const products = await db.select().from(supplierProductsTable)
      .where(and(eq(supplierProductsTable.merchantId, merchant.id), eq(supplierProductsTable.status, "active"), eq(supplierProductsTable.visibility, "active")))
      .orderBy(desc(supplierProductsTable.updatedAt)).limit(limit);
    const results: Array<Record<string, unknown>> = [];
    for (const product of products) {
      if (!product.imageUrl) { results.push({ productId: product.id, status: "skipped", reason: "missing primary image" }); continue; }
      try {
        const plan = planAd({
          storeName: merchant.storeName, productTitle: product.title, description: product.description, category: product.category, brand: product.brand,
          price: product.sellingPrice === null ? null : Number(product.sellingPrice), currency: product.currency, availability: product.availability,
          sourceCost: product.price === null ? null : Number(product.price), audience: req.body?.audience, goal: req.body?.goal, offer: req.body?.offer,
        });
        const [campaign] = await db.insert(adCampaignsTable).values({
          merchantId: merchant.id, productId: product.id, goal: typeof req.body?.goal === "string" ? req.body.goal : "sales",
          audience: typeof req.body?.audience === "string" ? req.body.audience.trim() : null, offer: typeof req.body?.offer === "string" ? req.body.offer.trim() : null,
          status: "rendering", brainSummary: `Score ${plan.score}/100. ${plan.reasoning.join(" ")}`,
        }).returning();
        if (!campaign) throw new Error("Campaign could not be created");
        let completed = 0;
        for (const variant of VARIANTS) {
          const [creative] = await db.insert(adCreativesTable).values({
            merchantId: merchant.id, campaignId: campaign.id, productId: product.id, platform: variant.platform, aspectRatio: variant.aspectRatio,
            durationSeconds: variant.durationSeconds, title: product.title, caption: plan.caption, hashtags: plan.hashtags, script: plan.script, status: "rendering",
          }).returning();
          if (!creative) continue;
          const outPath = path.join(os.tmpdir(), `ts-commerce-${randomUUID()}.mp4`);
          try {
            const buffer = await renderProductAd({ imageUrl: product.imageUrl, title: product.title, hook: plan.hook, proof: plan.proof, cta: plan.cta,
              durationSeconds: variant.durationSeconds, width: variant.width, height: variant.height, outputPath: outPath });
            if (buffer.byteLength > MAX_VIDEO_BYTES) throw new Error("Rendered advertisement exceeded the 12 MB storage limit");
            await db.update(adCreativesTable).set({ status: "completed", videoData: buffer.toString("base64"), completedAt: new Date(), errorMessage: null })
              .where(and(eq(adCreativesTable.id, creative.id), eq(adCreativesTable.merchantId, merchant.id)));
            completed++;
          } catch (error) {
            await db.update(adCreativesTable).set({ status: "failed", errorMessage: error instanceof Error ? error.message : "Renderer failed" })
              .where(and(eq(adCreativesTable.id, creative.id), eq(adCreativesTable.merchantId, merchant.id)));
          } finally { try { await unlink(outPath); } catch {} }
        }
        await db.update(adCampaignsTable).set({ status: completed ? "completed" : "failed", updatedAt: new Date() })
          .where(and(eq(adCampaignsTable.id, campaign.id), eq(adCampaignsTable.merchantId, merchant.id)));
        results.push({ productId: product.id, campaignId: campaign.id, status: completed ? "completed" : "failed", variantsCompleted: completed });
      } catch (error) {
        results.push({ productId: product.id, status: "failed", reason: error instanceof Error ? error.message : "generation failed" });
      }
    }
    res.status(201).json({ requested: products.length, processed: results.length, results });
  } catch (error) {
    fail(res, 500, error instanceof Error ? error.message : "Store-wide ad generation failed");
  } finally {
    storeGenerationLocks.delete(merchant.id);
  }
});

router.post("/ads/generator/stitch", async (req, res): Promise<void> => {
  const merchant = await merchantFor(req);
  if (!merchant) { fail(res, 401, "Authentication required"); return; }
  const rawIds = Array.isArray(req.body?.creativeIds) ? req.body.creativeIds : [];
  const creativeIds = rawIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0).slice(0, 20);
  if (creativeIds.length < 2) { fail(res, 400, "Choose at least two completed video clips to stitch"); return; }
  const creatives = await db.select().from(adCreativesTable).where(and(eq(adCreativesTable.merchantId, merchant.id), eq(adCreativesTable.status, "completed")));
  const selected = creativeIds.map((id: string) => creatives.find((creative) => creative.id === id)).filter((item): item is typeof creatives[number] => Boolean(item));
  if (selected.length !== creativeIds.length) { fail(res, 404, "One or more video clips are unavailable"); return; }
  const first = selected[0]!;
  if (selected.some((creative) => creative.aspectRatio !== first.aspectRatio)) { fail(res, 422, "Stitch clips with the same aspect ratio"); return; }

  const work = await (await import("node:fs/promises")).mkdtemp(path.join(os.tmpdir(), "ts-commerce-stitch-"));
  const inputPaths: string[] = [];
  const outputPath = path.join(work, `stitched-${randomUUID()}.mp4`);
  try {
    const { writeFile: write, readFile: read, rm } = await import("node:fs/promises");
    for (const [index, creative] of selected.entries()) {
      const inputPath = path.join(work, `clip-${index}.mp4`);
      await write(inputPath, Buffer.from(creative.videoData!, "base64"));
      inputPaths.push(inputPath);
    }
    const inputArgs = inputPaths.flatMap((inputPath) => ["-i", inputPath]);
    const transition = 0.6;
    const durations = selected.map((creative: typeof creatives[number]) => creative.durationSeconds);
    const filterParts: string[] = [];
    let cumulative = durations[0]!;
    filterParts.push(`[0:v]setpts=PTS-STARTPTS[v0]`);
    for (let i = 1; i < selected.length; i++) {
      filterParts.push(`[${i}:v]setpts=PTS-STARTPTS[v${i}]`);
      const offset = Math.max(0, cumulative - transition * i);
      filterParts.push(`[v${i-1}][v${i}]xfade=transition=fade:duration=${transition}:offset=${offset}[x${i}]`);
      cumulative += durations[i]! - transition;
    }
    const finalLabel = `x${selected.length - 1}`;
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    await promisify(execFile)("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...inputArgs, "-filter_complex", filterParts.join(";"), "-map", `[${finalLabel}]`, "-an", "-c:v", "libx264", "-preset", process.env.TS_AD_FFMPEG_PRESET || "veryfast", "-crf", process.env.TS_AD_FFMPEG_CRF || "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputPath]);
    const buffer = await read(outputPath);
    if (buffer.byteLength > 100 * 1024 * 1024) throw new Error("Stitched video exceeded the 100 MB export limit");
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Content-Disposition", `attachment; filename="ts-commerce-stitched-${first.aspectRatio.replace(':','x')}-${randomUUID()}.mp4"`);
    res.end(buffer);
  } catch (error) {
    fail(res, 500, error instanceof Error ? error.message : "Video stitching failed");
  } finally {
    const { rm } = await import("node:fs/promises");
    await rm(work, { recursive: true, force: true });
  }
});

export default router;
