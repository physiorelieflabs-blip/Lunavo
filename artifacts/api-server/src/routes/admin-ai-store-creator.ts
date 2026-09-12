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
      SELECT id,niche,status,research,build_plan,error_message,created_at,updated_at,completed_at
      FROM admin_ai_store_jobs ORDER BY created_at DESC LIMIT 100
    `);
    res.json({ jobs: result.rows, requestedBy: userId });
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
