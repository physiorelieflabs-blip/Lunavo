import { Router, type Request, type Response } from "express";
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
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const question = text(req.body?.question, 2_000);
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
      idempotencyKey: `dropship-intelligence:${ctx.merchantId}:${new Date().toISOString().slice(0, 10)}:${result.graph.summary.reorderCandidateCount}:${result.graph.summary.atRiskCustomerCount}`,
      payload: {
        generatedAt: result.graph.generatedAt,
        productCount: result.graph.summary.productCount,
        reorderCandidateCount: result.graph.summary.reorderCandidateCount,
        atRiskCustomerCount: result.graph.summary.atRiskCustomerCount,
        automationCandidates: result.graph.summary.automationCandidates,
      },
    });
    res.setHeader("Cache-Control", "no-store");
    const commandQuestion = question ?? "Find the highest-leverage connected actions across products, supplier routing, landed cost, demand, inventory, fulfillment, customers, marketing and automation.";
    const suppliedIdempotency = text(req.body?.idempotencyKey, 220);
    if (suppliedIdempotency && !/^[A-Za-z0-9._:-]{1,220}$/.test(suppliedIdempotency)) {
      res.status(400).json({ error: "Invalid idempotencyKey" });
      return;
    }
    const commandIdempotency = suppliedIdempotency
      ? `dropship-command:${ctx.merchantId}:${suppliedIdempotency}`
      : `dropship-command:${ctx.merchantId}:${new Date().toISOString()}:${result.graph.generatedAt}:${String(result.brain.consensus)}`;
    const commandRun = await db.execute(sql`
      INSERT INTO dropship_command_runs
        (merchant_id,question,context,plan,brain_model,contributors,roles,consensus,status,idempotency_key,completed_at)
      VALUES
        (${ctx.merchantId},${commandQuestion.slice(0,2000)},
         ${JSON.stringify({
           summary: result.graph.summary,
           generatedAt: result.graph.generatedAt,
           authorityRules: result.graph.authorityRules,
           modernPlatformParity: result.graph.modernPlatformParity,
           decisionLoop: result.graph.decisionLoop,
           signals: result.graph.summary.automationCandidates,
         })}::jsonb,
         ${JSON.stringify({content:result.brain.content,graph:result.graph.summary})}::jsonb,
         ${result.brain.model},${JSON.stringify(result.brain.contributors)}::jsonb,${JSON.stringify(result.brain.roles)}::jsonb,
         ${result.brain.consensus},'completed',${commandIdempotency},now())
      ON CONFLICT (idempotency_key) DO UPDATE SET
        plan=EXCLUDED.plan,context=EXCLUDED.context,brain_model=EXCLUDED.brain_model,
        contributors=EXCLUDED.contributors,roles=EXCLUDED.roles,consensus=EXCLUDED.consensus,
        status='completed',completed_at=now()
      RETURNING id,created_at
    `);
    res.status(201).json({
      ...result,
      commandRun: commandRun.rows[0] ?? null,
      persisted: true,
      executionBoundary: "recommendation_only",
      financialAuthority: "provider_verified_ledger",
      inventoryAuthority: "server_inventory_state",
    });
  } catch (error) {
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
      require("@workspace/db").sql`
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
