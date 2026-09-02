import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json(HealthCheckResponse.parse({ status: "ok" }));
  } catch {
    res.status(503).json(HealthCheckResponse.parse({ status: "database_unavailable" }));
  }
});

export default router;
