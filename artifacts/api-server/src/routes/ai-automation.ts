import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requirePermission } from "../lib/tenant-access";
import { reserveAutomationActionInTransaction } from "../lib/automation-guard";
import { scoreProductOpportunity, type OpportunityEvidence } from "../lib/opportunity-scoring";
import { recommendDynamicPrice, type PricingInputs } from "../lib/dynamic-pricing";

const router = Router();

async function context(req: Request, res: Response) {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  const found = await db.execute(sql`SELECT id FROM merchants WHERE clerk_user_id=${userId} LIMIT 1`);
  const merchantId = Number((found.rows[0] as {id?:number}|undefined)?.id);
  if (!Number.isInteger(merchantId)) { res.status(404).json({ error: "Merchant workspace not found" }); return null; }
  try { await requirePermission(userId, merchantId, "team.manage"); } catch { res.status(403).json({ error: "Permission required" }); return null; }
  return { userId, merchantId };
}

router.post("/merchant/ai/opportunities/score", async (req, res, next) => {
  try {
    const ctx = await context(req,res); if (!ctx) return;
    const externalKey = String(req.body?.externalKey ?? "").trim().slice(0,255);
    const productName = String(req.body?.productName ?? "").trim().slice(0,500);
    const currency = String(req.body?.currency ?? "USD").toUpperCase();
    const supplierCostMinor = Number(req.body?.supplierCostMinor);
    if (!externalKey || !productName || !/^[A-Z]{3}$/.test(currency) || !Number.isSafeInteger(supplierCostMinor) || supplierCostMinor < 0) { res.status(400).json({error:"Invalid opportunity input"}); return; }
    const evidence = req.body?.evidence as OpportunityEvidence;
    if (!evidence || typeof evidence !== "object") { res.status(400).json({error:"Provider/research evidence is required; Lunavo will not invent market data"}); return; }
    const score = scoreProductOpportunity(evidence);
    const pricing = recommendDynamicPrice({ supplierCostMinor, targetMarginPercent: Number(req.body?.targetMarginPercent ?? 15), marketLowMinor: Number(req.body?.marketLowMinor), marketHighMinor: Number(req.body?.marketHighMinor), demandScore: score.demand, competitionScore: score.competition, minPriceMinor: Number(req.body?.minPriceMinor) });
    await db.execute(sql`
      INSERT INTO product_opportunity_scores (merchant_id,external_key,product_name,currency,supplier_cost_minor,recommended_price_minor,maximum_commercial_price_minor,demand_score,competition_score,profit_score,market_fit_score,supplier_score,risk_score,opportunity_label,evidence)
      VALUES (${ctx.merchantId},${externalKey},${productName},${currency},${supplierCostMinor},${pricing.recommendedPriceMinor},${pricing.maximumCommercialPriceMinor},${score.demand},${score.competition},${score.profit},${score.marketFit},${score.supplier},${score.risk},${score.label},${JSON.stringify({ ...evidence, total: score.total })}::jsonb)
      ON CONFLICT (merchant_id,external_key) DO UPDATE SET product_name=EXCLUDED.product_name,currency=EXCLUDED.currency,supplier_cost_minor=EXCLUDED.supplier_cost_minor,recommended_price_minor=EXCLUDED.recommended_price_minor,maximum_commercial_price_minor=EXCLUDED.maximum_commercial_price_minor,demand_score=EXCLUDED.demand_score,competition_score=EXCLUDED.competition_score,profit_score=EXCLUDED.profit_score,market_fit_score=EXCLUDED.market_fit_score,supplier_score=EXCLUDED.supplier_score,risk_score=EXCLUDED.risk_score,opportunity_label=EXCLUDED.opportunity_label,evidence=EXCLUDED.evidence,scored_at=now()
    `);
    res.status(201).json({ score, pricing });
  } catch(e){ next(e); }
});

router.post("/merchant/ai/pricing/recommend", async (req,res,next)=>{
  try{
    const ctx=await context(req,res); if(!ctx)return;
    const inputs=req.body as PricingInputs;
    const result=recommendDynamicPrice(inputs);
    const policy=await db.execute(sql`SELECT min_margin_percent,max_price_multiplier,require_approval_for_price_changes FROM merchant_automation_policies WHERE merchant_id=${ctx.merchantId}`);
    const p=policy.rows[0] as Record<string,any>|undefined;
    if(p && Number(inputs.targetMarginPercent) < Number(p.min_margin_percent)) { res.status(409).json({error:"Requested margin is below the merchant automation floor"}); return; }
    const multiplier=Number(p?.max_price_multiplier ?? 3);
    if(result.maximumCommercialPriceMinor > Math.ceil(Number(inputs.supplierCostMinor)*multiplier)) { res.status(409).json({error:"Maximum commercial price exceeds merchant automation guardrail"}); return; }
    res.json({ result, requiresApproval:Boolean(p?.require_approval_for_price_changes) });
  }catch(e){next(e);}
});

router.post("/merchant/ai/actions/reserve", async(req,res,next)=>{
  try{
    const ctx=await context(req,res);if(!ctx)return;
    const kind=req.body?.kind === "ad" ? "ad" : "action";
    const idempotencyKey=String(req.body?.idempotencyKey ?? "").trim().slice(0,255);
    if(!idempotencyKey){res.status(400).json({error:"idempotencyKey required"});return;}

    const result = await db.transaction(async (tx) => {
      const existing=await tx.execute(sql`SELECT id,status,metadata FROM merchant_automation_audit WHERE merchant_id=${ctx.merchantId} AND idempotency_key=${idempotencyKey} LIMIT 1 FOR UPDATE`);
      if(existing.rows.length) return { reserved:true, replayed:true, audit:existing.rows[0] };

      // Quota reservation and audit creation are one transaction. A concurrent
      // retry can no longer consume a quota unit and then lose the audit row.
      const reservation = await reserveAutomationActionInTransaction(tx,ctx.merchantId,kind);
      const inserted=await tx.execute(sql`INSERT INTO merchant_automation_audit (merchant_id,action_type,status,idempotency_key,reason,metadata) VALUES (${ctx.merchantId},${kind},'planned',${idempotencyKey},${String(req.body?.reason??"").slice(0,1000)},${JSON.stringify(req.body?.metadata ?? {})}::jsonb) RETURNING id,status`);
      return { reserved:true,replayed:false,...reservation,audit:inserted.rows[0] };
    });
    res.json(result);
  }catch(e){next(e);}
});

export default router;
