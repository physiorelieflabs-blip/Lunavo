import { Router, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, merchantsTable, adCreativesTable } from "@workspace/db";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const router = Router();
const execFileAsync = promisify(execFile);

async function merchantFor(req: Request) {
  const userId = getAuth(req).userId;
  if (!userId) return null;
  return (await db.select().from(merchantsTable).where(eq(merchantsTable.clerkUserId, userId)).limit(1))[0] ?? null;
}

router.post("/ads/generator/stitch", async (req, res): Promise<void> => {
  const merchant = await merchantFor(req);
  if (!merchant) { res.status(401).json({ error: "Authentication required" }); return; }
  const rawIds: unknown[] = Array.isArray(req.body?.creativeIds) ? req.body.creativeIds : [];
  const creativeIds = rawIds.filter((value): value is string => typeof value === "string" && /^[0-9a-f-]{20,}$/i.test(value)).slice(0, 20);
  if (creativeIds.length < 2) { res.status(400).json({ error: "Choose at least two completed video clips to stitch" }); return; }
  const creatives = await db.select().from(adCreativesTable).where(and(eq(adCreativesTable.merchantId, merchant.id), eq(adCreativesTable.status, "completed")));
  const byId = new Map(creatives.map((creative) => [creative.id, creative]));
  const selected = creativeIds.map((id) => byId.get(id)).filter((item): item is (typeof creatives)[number] => Boolean(item));
  if (selected.length !== creativeIds.length || selected.some((creative) => !creative.videoData)) { res.status(404).json({ error: "One or more video clips are unavailable" }); return; }
  const first = selected[0]!;
  if (selected.some((creative) => creative.aspectRatio !== first.aspectRatio)) { res.status(422).json({ error: "Stitch clips with the same aspect ratio" }); return; }
  const duration = selected.reduce((sum, creative) => sum + Math.max(1, creative.durationSeconds), 0);
  const work = await mkdtemp(path.join(os.tmpdir(), "ts-commerce-stitch-audio-"));
  const outputPath = path.join(work, "stitched.mp4");
  try {
    const inputPaths: string[] = [];
    for (const [index, creative] of selected.entries()) {
      const inputPath = path.join(work, `clip-${index}.mp4`);
      await writeFile(inputPath, Buffer.from(creative.videoData!, "base64"));
      inputPaths.push(inputPath);
    }
    const inputArgs = inputPaths.flatMap((inputPath) => ["-i", inputPath]);
    const transition = 0.6;
    const durations = selected.map((creative) => Math.max(1, creative.durationSeconds));
    const filters: string[] = ["[0:v]setpts=PTS-STARTPTS[v0]"];
    let cumulative = durations[0]!;
    for (let i = 1; i < selected.length; i++) {
      filters.push(`[${i}:v]setpts=PTS-STARTPTS[v${i}]`);
      const offset = Math.max(0, cumulative - transition * i);
      filters.push(`[v${i - 1}][v${i}]xfade=transition=fade:duration=${transition}:offset=${offset}[x${i}]`);
      cumulative += durations[i]! - transition;
    }
    const audioInputs = selected.map((_creative, index) => `[${index}:a]aresample=44100,asetpts=PTS-STARTPTS[a${index}]`).join(";");
    const audioConcat = selected.map((_creative, index) => `[a${index}]`).join("") + `concat=n=${selected.length}:v=0:a=1[audio]`;
    const finalVideo = `[x${selected.length - 1}]`;
    const hasAudioMap = selected.every((_creative) => true);
    const videoDuration = Math.max(1, cumulative);
    const backgroundAudio = `sine=frequency=220:sample_rate=44100,volume=0.025,afade=t=in:st=0:d=0.4,afade=t=out:st=${Math.max(0, duration - 0.8)}:d=0.8`;
    const filter = hasAudioMap
      ? `${filters.join(";")};${audioInputs};${audioConcat}`
      : filters.join(";");
    const mapArgs = hasAudioMap ? ["-map", finalVideo, "-map", "[audio]"] : ["-map", finalVideo];
    await execFileAsync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...inputArgs, "-f", "lavfi", "-t", String(videoDuration), "-i", backgroundAudio, "-filter_complex", filter, ...mapArgs, "-c:v", "libx264", "-preset", process.env.TS_AD_FFMPEG_PRESET || "veryfast", "-crf", process.env.TS_AD_FFMPEG_CRF || "25", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart", outputPath]);
    const buffer = await readFile(outputPath);
    if (buffer.byteLength > 100 * 1024 * 1024) { res.status(413).json({ error: "Stitched video exceeded the 100 MB export limit" }); return; }
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Content-Disposition", `attachment; filename="ts-commerce-long-ad.mp4"`);
    res.end(buffer);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Video stitching failed" });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

export default router;
