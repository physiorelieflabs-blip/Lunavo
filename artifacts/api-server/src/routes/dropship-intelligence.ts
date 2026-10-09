import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { and, eq, or, sql } from "drizzle-orm";
import { db, merchantsTable, supplierProductsTable } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { emitDomainEvent } from "../lib/domain-events";
import { requirePermission } from "../lib/tenant-access";
import {
  buildDropshipOperatingGraph,
  buildMaxConsensusDropshipPlan,
  persistDropshipIntelligence,
  recordMarketResearch,
} from "../lib/dropship-intelligence";

const router = Router();

async function merchantFor(req: Request, res: Response) {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const [merchant] = await db.select({ id: merchantsTable.id })
    .from(merchantsTable)
    .where(and(
      eq(merchantsTable.status, "active"),
      or(eq(merchantsTable.localAuthUserId, userId), eq(merchantsTable.clerkUserId, userId)),
    ))
    .limit(1);
  if (!merchant) {
    res.status(404).json({ error: "Merchant workspace not found" });
    return null;
  }
  try {
    await requirePermission(userId, merchant.id, "ai.execute");
  } catch {
    res.status(403).json({ error: "Dropship intelligence permission required" });
    return null;
  }
  return { merchantId: merchant.id, userId };
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function boundedScore(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
}

router.get("/merchant/dropship/intelligence", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const graph = await buildDropshipOperatingGraph(ctx.merchantId);
    res.setHeader("Cache-Control", "no-store");
    res.json(graph);
  } catch (error) {
    next(error);
  }
});

router.post("/merchant/dropship/intelligence/run", async (req, res, next) => {
  let claimedRunId: string | null = null;
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;

    const question = text(req.body?.question, 2_000);
    const commandQuestion = question ?? "Find the highest-leverage connected actions across products, supplier routing, landed cost, demand, inventory, fulfillment, customers, marketing and automation.";
    const suppliedIdempotency = text(req.body?.idempotencyKey, 220);
    if (suppliedIdempotency && !/^[A-Za-z0-9._:-]{1,220}$/.test(suppliedIdempotency)) {
      res.status(400).json({ error: "Invalid idempotencyKey" });
      return;
    }
    // Generate a fresh key only when the caller does not provide one. Client retries
    // should send the same key so a request is never executed twice accidentally.
    const commandIdempotency = suppliedIdempotency
      ? `dropship-command:${ctx.merchantId}:${suppliedIdempotency}`
      : `dropship-command:${ctx.merchantId}:${randomUUID()}`;

    const insertClaim = await db.execute(sql`
      INSERT INTO dropship_command_runs (merchant_id,question,status,idempotency_key)
      VALUES (${ctx.merchantId},${commandQuestion},'running',${commandIdempotency})
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id,status,created_at
    `);
    let commandRun = (insertClaim.rows[0] ?? null) as { id: string; status: string; created_at: unknown } | null;
    let isReplay = false;

    if (!commandRun) {
      const existingResult = await db.execute(sql`
        SELECT id,merchant_id,question,context,plan,brain_model,contributors,roles,consensus,status,idempotency_key,created_at,completed_at
        FROM dropship_command_runs
        WHERE merchant_id=${ctx.merchantId} AND idempotency_key=${commandIdempotency}
        LIMIT 1
      `);
      const existing = (existingResult.rows[0] ?? null) as Record<string, unknown> | null;
      if (!existing) {
        res.status(409).json({ error: "The command key is being claimed; retry with the same idempotency key." });
        return;
      }
      if (existing.status === "completed") {
        const graph = await buildDropshipOperatingGraph(ctx.merchantId);
        const savedPlan = existing.plan && typeof existing.plan === "object" && !Array.isArray(existing.plan)
          ? existing.plan as Record<string, unknown>
          : {};
        const list = (value: unknown) => Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({
          graph,
          brain: {
            model: typeof existing.brain_model === "string" ? existing.brain_model : "unknown",
            content: typeof savedPlan.content === "string" ? savedPlan.content : "",
            contributors: list(existing.contributors),
            roles: list(existing.roles),
            consensus: existing.consensus === "strong" || existing.consensus === "mixed" ? existing.consensus : "single",
          },
          commandRun: existing,
          persisted: true,
          replayed: true,
          executionBoundary: "recommendation_only",
          financialAuthority: "provider_verified_ledger",
          inventoryAuthority: "server_inventory_state",
        });
        return;
      }
      if (existing.status === "running") {
        res.status(409).json({ error: "This command is already running. Reuse the same key to retrieve its result.", commandRun: existing });
        return;
      }
      const reclaimed = await db.execute(sql`
        UPDATE dropship_command_runs
        SET status='running',question=${commandQuestion},completed_at=NULL
        WHERE merchant_id=${ctx.merchantId} AND idempotency_key=${commandIdempotency} AND status='failed'
        RETURNING id,status,created_at
      `);
      commandRun = (reclaimed.rows[0] ?? null) as { id: string; status: string; created_at: unknown } | null;
      if (!commandRun) {
        res.status(409).json({ error: "This command cannot be claimed. Retry with a new command key." });
        return;
      }
      isReplay = true;
    }

    claimedRunId = commandRun.id;
    const result = await buildMaxConsensusDropshipPlan(ctx.merchantId, question);
    await persistDropshipIntelligence(ctx.merchantId, result.graph, result.brain.model);

    await emitDomainEvent(db, {
      merchantId: ctx.merchantId,
      eventType: "dropship.intelligence.refreshed",
      aggregateType: "dropship_intelligence",
      aggregateId: String(ctx.merchantId),
      actorType: "merchant",
      actorId: ctx.userId,
      source: "merchant_api",
      idempotencyKey: `dropship-intelligence-command:${commandRun.id}`,
      payload: {
        commandRunId: commandRun.id,
        generatedAt: result.graph.generatedAt,
        productCount: result.graph.summary.productCount,
        reorderCandidateCount: result.graph.summary.reorderCandidateCount,
        supplierStockRiskCount: result.graph.summary.supplierStockRiskCount,
        atRiskCustomerCount: result.graph.summary.atRiskCustomerCount,
        automationCandidates: result.graph.summary.automationCandidates,
      },
    });

    const commandContext = {
      summary: result.graph.summary,
      generatedAt: result.graph.generatedAt,
      authorityRules: result.graph.authorityRules,
      modernPlatformParity: result.graph.modernPlatformParity,
      decisionLoop: result.graph.decisionLoop,
      signals: result.graph.summary.automationCandidates,
    };
    const storedPlan = { content: result.brain.content, graph: result.graph.summary };
    const saved = await db.execute(sql`
      UPDATE dropship_command_runs
      SET context=${JSON.stringify(commandContext)}::jsonb,
          plan=${JSON.stringify(storedPlan)}::jsonb,
          brain_model=${result.brain.model},
          contributors=${JSON.stringify(result.brain.contributors)}::jsonb,
          roles=${JSON.stringify(result.brain.roles)}::jsonb,
          consensus=${result.brain.consensus},
          status='completed',
          completed_at=now()
      WHERE id=${commandRun.id} AND merchant_id=${ctx.merchantId} AND status='running'
      RETURNING id,question,brain_model,contributors,roles,consensus,status,idempotency_key,created_at,completed_at
    `);
    if (!saved.rows[0]) throw new Error("Could not persist completed dropship command result");
    const finalRun = saved.rows[0];
    res.setHeader("Cache-Control", "no-store");
    res.status(isReplay ? 200 : 201).json({
      ...result,
      commandRun: finalRun,
      persisted: true,
      replayed: false,
      executionBoundary: "recommendation_only",
      financialAuthority: "provider_verified_ledger",
      inventoryAuthority: "server_inventory_state",
    });
  } catch (error) {
    if (claimedRunId) {
      await db.execute(sql`
        UPDATE dropship_command_runs
        SET status='failed',completed_at=NULL
        WHERE id=${claimedRunId} AND status='running'
      `).catch(() => undefined);
    }
    next(error);
  }
});

router.get("/merchant/dropship/commands/recent", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const limit = Math.max(1, Math.min(50, Math.trunc(Number(req.query.limit ?? 12))));
    const rows = await db.execute(sql`
      SELECT id,question,plan,brain_model,contributors,roles,consensus,status,created_at,completed_at
      FROM dropship_command_runs
      WHERE merchant_id=${ctx.merchantId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    res.setHeader("Cache-Control", "no-store");
    res.json({ runs: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/merchant/dropship/forecasts", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const rows = await db.execute(
      sql`
        SELECT f.*, p.title, p.currency, p.selling_price, p.availability, p.availability_quantity
        FROM dropship_demand_forecasts f
        JOIN supplier_products p ON p.id=f.supplier_product_id AND p.merchant_id=f.merchant_id
        WHERE f.merchant_id=${ctx.merchantId}
        ORDER BY f.recommended_reorder_units DESC, f.updated_at DESC
        LIMIT 250
      `,
    );
    res.json({ forecasts: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/merchant/dropship/research", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const sourceKindRaw = text(req.body?.sourceKind, 20);
    const allowed = new Set(["competitor","ad_spy","trend","supplier","market","pricing"]);
    if (!sourceKindRaw || !allowed.has(sourceKindRaw)) {
      res.status(400).json({ error: "Unsupported research source kind" });
      return;
    }

    const productId = req.body?.supplierProductId == null ? null : Number(req.body.supplierProductId);
    if (productId !== null) {
      if (!Number.isInteger(productId) || productId <= 0) {
        res.status(400).json({ error: "Invalid supplier product" });
        return;
      }
      const [product] = await db.select({ id: supplierProductsTable.id })
        .from(supplierProductsTable)
        .where(and(eq(supplierProductsTable.id, productId), eq(supplierProductsTable.merchantId, ctx.merchantId)))
        .limit(1);
      if (!product) {
        res.status(404).json({ error: "Supplier product not found" });
        return;
      }
    }

    const currency = text(req.body?.currency, 3)?.toUpperCase() ?? null;
    if (currency && !/^[A-Z]{3}$/.test(currency)) {
      res.status(400).json({ error: "Currency must be an ISO-style three-letter code" });
      return;
    }
    const observedPrice = req.body?.observedPriceMinor == null ? null : Number(req.body.observedPriceMinor);
    if (observedPrice !== null && (!Number.isSafeInteger(observedPrice) || observedPrice < 0)) {
      res.status(400).json({ error: "observedPriceMinor must be a non-negative integer minor-unit amount" });
      return;
    }

    const result = await recordMarketResearch({
      merchantId: ctx.merchantId,
      supplierProductId: productId,
      sourceKind: sourceKindRaw as "competitor" | "ad_spy" | "trend" | "supplier" | "market" | "pricing",
      sourceUrl: text(req.body?.sourceUrl, 2048),
      currency,
      observedPriceMinor: observedPrice,
      demandScore: boundedScore(req.body?.demandScore),
      competitionScore: boundedScore(req.body?.competitionScore),
      trendScore: boundedScore(req.body?.trendScore),
      notes: text(req.body?.notes, 4000),
      evidence: req.body?.evidence && typeof req.body.evidence === "object" && !Array.isArray(req.body.evidence) ? req.body.evidence : {},
      capturedBy: ctx.userId,
      model: text(req.body?.model, 300),
    });
    res.status(201).json({ research: result, authoritative: false });
  } catch (error) {
    next(error);
  }
});

router.get("/merchant/dropship/research", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const rows = await db.execute(
      sql`
        SELECT r.*, p.title
        FROM dropship_market_research r
        LEFT JOIN supplier_products p ON p.id=r.supplier_product_id AND p.merchant_id=r.merchant_id
        WHERE r.merchant_id=${ctx.merchantId}
        ORDER BY r.observed_at DESC, r.created_at DESC
        LIMIT 250
      `,
    );
    res.json({ research: rows.rows });
  } catch (error) {
    next(error);
  }
});

export default router;
