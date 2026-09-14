import { Router } from "express";
import { getAuth } from "@clerk/express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { isMasterAdmin } from "../lib/master-admin";

const router = Router();

async function requireMasterAdmin(req: any, res: any) {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  if (!(await isMasterAdmin(userId))) { res.status(403).json({ error: "Master Admin authority required" }); return null; }
  return userId;
}

router.post("/admin/ai-stores", async (req, res, next) => {
  try {
    const userId = await requireMasterAdmin(req, res); if (!userId) return;
    const niche = String(req.body?.niche ?? "").trim().slice(0, 1000) || null;
    const result = await db.execute(sql`
      INSERT INTO admin_ai_store_jobs (requested_by,niche,status)
      VALUES (${userId},${niche},'queued')
      RETURNING id,requested_by,niche,status,created_at,updated_at
    `);
    res.status(202).json({
      job: result.rows[0],
      executionBoundary: "The job is durable and server-controlled. Research, supplier discovery and external publishing require real provider/connector authorization; no fake products or connections are created.",
    });
  } catch (e) { next(e); }
});

router.get("/admin/ai-stores", async (req, res, next) => {
  try {
    const userId = await requireMasterAdmin(req, res); if (!userId) return;
    const result = await db.execute(sql`
      SELECT j.id,j.niche,j.status,j.research,j.build_plan,j.error_message,j.created_at,j.updated_at,j.completed_at,
             a.id AS artifact_id,a.store_name,a.store_slug,a.status AS artifact_status,a.catalog,a.sourcing_evidence,a.pricing_strategy,a.seo
      FROM admin_ai_store_jobs j
      LEFT JOIN admin_ai_store_build_artifacts a ON a.job_id=j.id
      ORDER BY j.created_at DESC LIMIT 100
    `);
    res.json({ jobs: result.rows, requestedBy: userId });
  } catch (e) { next(e); }
});

router.post("/admin/ai-stores/:id/build", async (req, res, next) => {
  try {
    const userId = await requireMasterAdmin(req, res); if (!userId) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: "Invalid job id" }); return; }

    const result = await db.execute(sql`
      SELECT id,niche,status,research,build_plan
      FROM admin_ai_store_jobs
      WHERE id=${id}
      FOR UPDATE
    `);
    const job: any = result.rows[0];
    if (!job) { res.status(404).json({ error: "AI store job not found" }); return; }
    if (!['ready_for_review','building'].includes(String(job.status))) {
      res.status(409).json({ error: "AI store job is not ready to build", status: job.status }); return;
    }

    const research: any = job.research && typeof job.research === "object" ? job.research : {};
    const opportunities = Array.isArray(research.opportunities) ? research.opportunities : [];
    const valid = opportunities.filter((item: any) => item && typeof item === "object" && String(item.name ?? item.productName ?? "").trim());
    if (!valid.length) {
      res.status(422).json({ error: "No validated product opportunities exist for this job; the system will not invent a catalog." });
      return;
    }

    const niche = String(job.niche ?? "commerce").trim() || "commerce";
    const storeName = String(req.body?.storeName ?? `${niche} Market`).trim().slice(0,120);
    const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80) || `ai-store-${id}`;
    const catalog = valid.slice(0,100).map((item: any, index: number) => ({
      id: `${id}-${index+1}`,
      name: String(item.name ?? item.productName).trim().slice(0,240),
      demand: item.demand ?? null,
      competition: item.competition ?? null,
      growth: item.growth ?? null,
      rationale: String(item.rationale ?? item.reason ?? "").trim().slice(0,1200),
      risks: Array.isArray(item.risks) ? item.risks.slice(0,10) : [],
      evidence: Array.isArray(item.evidence) ? item.evidence.slice(0,10) : [],
      status: "draft",
    }));

    const artifact = await db.execute(sql`
      INSERT INTO admin_ai_store_build_artifacts
        (job_id,requested_by,store_name,store_slug,niche,description,brand,catalog,sourcing_evidence,pricing_strategy,seo,status)
      VALUES
        (${id},${userId},${storeName},${slug},${niche},${String(research.summary ?? "AI-researched commerce store").slice(0,2000)},
         ${JSON.stringify({name:storeName,niche})}::jsonb,${JSON.stringify(catalog)}::jsonb,
         ${JSON.stringify(research.evidence ?? [])}::jsonb,
         ${JSON.stringify(job.build_plan?.pricing ?? {})}::jsonb,
         ${JSON.stringify(job.build_plan?.seo ?? {})}::jsonb,'draft')
      ON CONFLICT (job_id) DO UPDATE SET
        requested_by=EXCLUDED.requested_by,store_name=EXCLUDED.store_name,store_slug=EXCLUDED.store_slug,
        niche=EXCLUDED.niche,description=EXCLUDED.description,brand=EXCLUDED.brand,catalog=EXCLUDED.catalog,
        sourcing_evidence=EXCLUDED.sourcing_evidence,pricing_strategy=EXCLUDED.pricing_strategy,seo=EXCLUDED.seo,
        status='draft',updated_at=now()
      RETURNING *
    `);

    await db.execute(sql`
      UPDATE admin_ai_store_jobs
      SET status='building',updated_at=now()
      WHERE id=${id}
    `);

    res.status(201).json({
      artifact: artifact.rows[0],
      status: "draft",
      nextBoundary: "This is a real persisted store build artifact. Publication remains gated until a real storefront, product ownership, pricing evidence and any required supplier/provider authorization are available; no fabricated inventory or external connection is created.",
    });
  } catch (e) { next(e); }
});

router.post("/admin/ai-stores/:id/cancel", async (req, res, next) => {
  try {
    const userId = await requireMasterAdmin(req, res); if (!userId) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: "Invalid job id" }); return; }
    const result = await db.execute(sql`
      UPDATE admin_ai_store_jobs SET status='cancelled',updated_at=now()
      WHERE id=${id} AND status IN ('queued','researching','ready_for_review','building')
      RETURNING id,status,updated_at
    `);
    if (!result.rows.length) { res.status(404).json({ error: "Active AI store job not found" }); return; }
    res.json({ job: result.rows[0], cancelledBy: userId });
  } catch (e) { next(e); }
});

export default router;
