import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { requirePermission } from "../lib/tenant-access";
import { approveWorkflowRun, dispatchWorkflowEvent, isWorkflowTriggerEvent, WORKFLOW_TRIGGER_EVENTS } from "../lib/automation-engine";

const router = Router();
const conditionOps = new Set(["eq","neq","in","gt","gte","lt","lte","contains","exists"]);
const actionKinds = new Set(["create_operation","create_message","set_feature_flag","log"]);
const protectedFeatureKeyPrefixes = ["payment","payout","withdrawal","ledger","provider","webhook","kyc","security","admin","auth"];
const operationKinds = new Set(["task","product_alert","support_ticket","lead","delivery_issue","supplier_issue"]);

async function merchantContext(req: Request, res: Response) {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  const result = await db.execute(sql`SELECT id FROM merchants WHERE status='active' AND (clerk_user_id=${userId} OR local_auth_user_id=${userId}) LIMIT 1`);
  const merchantId = Number((result.rows[0] as { id?: number } | undefined)?.id);
  if (!Number.isInteger(merchantId)) { res.status(404).json({ error: "Merchant workspace not found" }); return null; }
  try { await requirePermission(userId, merchantId, "team.manage"); } catch { res.status(403).json({ error: "Permission required" }); return null; }
  return { userId, merchantId };
}
function fail(res: Response, status: number, error: string) { res.status(status).json({ error }); }
function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0,max) : ""; }
function validateConditions(input: unknown): { ok: boolean; value: unknown; error?: string } {
  if (!Array.isArray(input) && (!input || typeof input !== "object")) return { ok: false, value: null, error: "Conditions must be an array or all/any group" };
  const validateOne = (condition: unknown): boolean => {
    if (!condition || typeof condition !== "object" || Array.isArray(condition)) return false;
    const c = condition as Record<string, unknown>;
    if (Array.isArray(c.all)) return c.all.length <= 20 && c.all.every(validateOne);
    if (Array.isArray(c.any)) return c.any.length <= 20 && c.any.every(validateOne);
    return typeof c.path === "string" && /^[a-zA-Z0-9_.]{1,180}$/.test(c.path.trim()) && (c.op === undefined || conditionOps.has(String(c.op))) &&
      (c.op !== "in" || Array.isArray(c.value));
  };
  const value = Array.isArray(input) ? input : [input];
  if (value.length > 20 || !value.every(validateOne)) return { ok: false, value: null, error: "Invalid condition definition" };
  return { ok: true, value: input };
}
function validateActions(input: unknown): { ok: boolean; value: Array<Record<string, unknown>>; error?: string } {
  if (!Array.isArray(input) || input.length > 20) return { ok: false, value: [], error: "Actions must be an array with at most 20 actions" };
  const value: Array<Record<string, unknown>> = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, value: [], error: "Invalid action" };
    const action = raw as Record<string, unknown>;
    if (typeof action.kind !== "string" || !actionKinds.has(action.kind)) return { ok: false, value: [], error: "Unsupported automation action" };
    const config = action.config && typeof action.config === "object" && !Array.isArray(action.config) ? action.config as Record<string, unknown> : {};
    if (action.kind === "create_operation") {
      if (!operationKinds.has(String(config.kind)) || !text(config.title,200)) return { ok:false,value:[],error:"Invalid operation action" };
    }
    if (action.kind === "create_message" && (!text(config.subject,200) || !text(config.body,4000))) return { ok:false,value:[],error:"Invalid message action" };
    if (action.kind === "set_feature_flag") { const flagKey=text(config.key,80); if (!/^[a-zA-Z0-9._:-]{1,80}$/.test(flagKey) || protectedFeatureKeyPrefixes.some(prefix=>flagKey.toLowerCase().startsWith(prefix))) return { ok:false,value:[],error:"Invalid or protected feature flag action" }; }
    value.push({ kind: action.kind, config });
  }
  return { ok: true, value };
}

router.get("/merchant/automation-workflows", async (req,res,next)=>{
  try {
    const ctx=await merchantContext(req,res); if(!ctx)return;
    const workflows=await db.execute(sql`
      SELECT id,workflow_key,name,description,enabled,mode,trigger_event,conditions,actions,cooldown_seconds,daily_run_limit,version,
             last_run_at,next_scheduled_at,schedule_interval_seconds,created_by,updated_by,created_at,updated_at
      FROM merchant_automation_workflows
      WHERE merchant_id=${ctx.merchantId}
      ORDER BY updated_at DESC
      LIMIT 200
    `);
    res.json({ workflows: workflows.rows, supportedTriggers: WORKFLOW_TRIGGER_EVENTS });
  } catch(e){ next(e); }
});

router.post("/merchant/automation-workflows", async (req,res,next)=>{
  try {
    const ctx=await merchantContext(req,res); if(!ctx)return;
    const key=text(req.body?.workflowKey,80);
    const name=text(req.body?.name,160);
    const description=text(req.body?.description,1000) || null;
    const triggerEvent=text(req.body?.triggerEvent,120);
    const mode=text(req.body?.mode,20) || "dry_run";
    const conditions=validateConditions(req.body?.conditions ?? []);
    const actions=validateActions(req.body?.actions ?? []);
    const cooldown=Number(req.body?.cooldownSeconds ?? 0);
    const limit=Number(req.body?.dailyRunLimit ?? 100);
    const scheduleInterval=Number(req.body?.scheduleIntervalSeconds ?? 0);
    if(!/^[a-zA-Z0-9._:-]{1,80}$/.test(key)||!name||!isWorkflowTriggerEvent(triggerEvent))return fail(res,400,"Invalid workflow identity or trigger");
    if(!["dry_run","approval","automatic"].includes(mode))return fail(res,400,"Invalid workflow mode");
    if(!conditions.ok)return fail(res,400,conditions.error ?? "Invalid conditions");
    if(!actions.ok)return fail(res,400,actions.error ?? "Invalid actions");
    if(!Number.isInteger(cooldown)||cooldown<0||cooldown>2592000||!Number.isInteger(limit)||limit<0||limit>10000)return fail(res,400,"Invalid workflow limits");
    if(!Number.isInteger(scheduleInterval)||scheduleInterval<0||scheduleInterval>2592000)return fail(res,400,"Invalid schedule interval");
    if(triggerEvent==="schedule.tick" && scheduleInterval<60)return fail(res,400,"Scheduled workflows require an interval of at least 60 seconds");
    if(triggerEvent!=="schedule.tick" && scheduleInterval!==0)return fail(res,400,"Schedule interval only applies to schedule.tick workflows");
    const nextScheduledAt=triggerEvent==="schedule.tick" ? new Date(Date.now()+scheduleInterval*1000) : null;
    const row=await db.execute(sql`
      INSERT INTO merchant_automation_workflows
        (merchant_id,workflow_key,name,description,enabled,mode,trigger_event,conditions,actions,cooldown_seconds,daily_run_limit,next_scheduled_at,schedule_interval_seconds,version,created_by,updated_by)
      VALUES
        (${ctx.merchantId},${key},${name},${description},false,${mode},${triggerEvent},${JSON.stringify(conditions.value)}::jsonb,${JSON.stringify(actions.value)}::jsonb,${cooldown},${limit},${nextScheduledAt},${scheduleInterval},1,${ctx.userId},${ctx.userId})
      RETURNING *
    `);
    res.status(201).json({ workflow: row.rows[0] ?? null });
  }catch(e){next(e);}
});

router.put("/merchant/automation-workflows/:id", async (req,res,next)=>{
  try {
    const ctx=await merchantContext(req,res); if(!ctx)return;
    const id=text(req.params.id,40);
    if(!/^[0-9a-fA-F-]{36}$/.test(id))return fail(res,400,"Invalid workflow id");
    const existing=(await db.execute(sql`SELECT * FROM merchant_automation_workflows WHERE id=${id} AND merchant_id=${ctx.merchantId} FOR UPDATE`)).rows[0] as Record<string,unknown>|undefined;
    if(!existing)return fail(res,404,"Workflow not found");
    const key=req.body?.workflowKey===undefined?String(existing.workflow_key):text(req.body.workflowKey,80);
    const name=req.body?.name===undefined?String(existing.name):text(req.body.name,160);
    const description=req.body?.description===undefined?(existing.description as string|null):text(req.body.description,1000)||null;
    const triggerEvent=req.body?.triggerEvent===undefined?String(existing.trigger_event):text(req.body.triggerEvent,120);
    const mode=req.body?.mode===undefined?String(existing.mode):text(req.body.mode,20);
    const conditions=validateConditions(req.body?.conditions===undefined?existing.conditions:req.body.conditions);
    const actions=validateActions(req.body?.actions===undefined?existing.actions:req.body.actions);
    const cooldown=req.body?.cooldownSeconds===undefined?Number(existing.cooldown_seconds):Number(req.body.cooldownSeconds);
    const limit=req.body?.dailyRunLimit===undefined?Number(existing.daily_run_limit):Number(req.body.dailyRunLimit);
    const scheduleInterval=req.body?.scheduleIntervalSeconds===undefined?Number(existing.schedule_interval_seconds??0):Number(req.body.scheduleIntervalSeconds);
    const enabled=req.body?.enabled===undefined?Boolean(existing.enabled):req.body.enabled===true;
    if(!/^[a-zA-Z0-9._:-]{1,80}$/.test(key)||!name||!isWorkflowTriggerEvent(triggerEvent)||!["dry_run","approval","automatic"].includes(mode))return fail(res,400,"Invalid workflow definition");
    if(!conditions.ok)return fail(res,400,conditions.error ?? "Invalid conditions");
    if(!actions.ok)return fail(res,400,actions.error ?? "Invalid actions");
    if(!Number.isInteger(cooldown)||cooldown<0||cooldown>2592000||!Number.isInteger(limit)||limit<0||limit>10000)return fail(res,400,"Invalid workflow limits");
    if(!Number.isInteger(scheduleInterval)||scheduleInterval<0||scheduleInterval>2592000)return fail(res,400,"Invalid schedule interval");
    if(triggerEvent==="schedule.tick" && scheduleInterval<60)return fail(res,400,"Scheduled workflows require an interval of at least 60 seconds");
    if(triggerEvent!=="schedule.tick" && scheduleInterval!==0)return fail(res,400,"Schedule interval only applies to schedule.tick workflows");
    const nextScheduledAt=triggerEvent==="schedule.tick" ? new Date(Date.now()+scheduleInterval*1000) : null;
    const row=await db.execute(sql`
      UPDATE merchant_automation_workflows
      SET workflow_key=${key},name=${name},description=${description},enabled=${enabled},mode=${mode},trigger_event=${triggerEvent},
          conditions=${JSON.stringify(conditions.value)}::jsonb,actions=${JSON.stringify(actions.value)}::jsonb,cooldown_seconds=${cooldown},
          daily_run_limit=${limit},next_scheduled_at=${nextScheduledAt},schedule_interval_seconds=${scheduleInterval},
          version=version+1,updated_by=${ctx.userId},updated_at=now()
      WHERE id=${id} AND merchant_id=${ctx.merchantId}
      RETURNING *
    `);
    res.json({ workflow: row.rows[0] ?? null });
  }catch(e){next(e);}
});

router.get("/merchant/automation-workflows/:id/runs", async(req,res,next)=>{
  try{
    const ctx=await merchantContext(req,res);if(!ctx)return;
    const id=text(req.params.id,40);if(!/^[0-9a-fA-F-]{36}$/.test(id))return fail(res,400,"Invalid workflow id");
    const runs=await db.execute(sql`
      SELECT r.id,r.workflow_id,r.event_id,r.status,r.idempotency_key,r.trigger_snapshot,r.result,r.error_code,r.error_message,
             r.scheduled_at,r.started_at,r.completed_at,r.created_at,a.status AS approval_status,a.reviewer_id,a.reviewed_at,a.note
      FROM merchant_automation_runs r
      LEFT JOIN merchant_automation_action_approvals a ON a.run_id=r.id
      WHERE r.workflow_id=${id} AND r.merchant_id=${ctx.merchantId}
      ORDER BY r.created_at DESC LIMIT 200
    `);
    res.json({ runs:runs.rows });
  }catch(e){next(e);}
});

router.post("/merchant/automation-runs/:id/decision", async(req,res,next)=>{
  try{
    const ctx=await merchantContext(req,res);if(!ctx)return;
    const id=text(req.params.id,40);if(!/^[0-9a-fA-F-]{36}$/.test(id))return fail(res,400,"Invalid run id");
    if(typeof req.body?.approve!=="boolean")return fail(res,400,"approve must be boolean");
    const result=await approveWorkflowRun(id,ctx.merchantId,ctx.userId,text(req.body?.note,1000)||null,req.body.approve);
    res.json(result);
  }catch(e){res.status(409).json({error:e instanceof Error?e.message:"Automation decision failed"});}
});

router.post("/merchant/automation-workflows/:id/run-now", async(req,res,next)=>{
  try{
    const ctx=await merchantContext(req,res);if(!ctx)return;
    const id=text(req.params.id,40);if(!/^[0-9a-fA-F-]{36}$/.test(id))return fail(res,400,"Invalid workflow id");
    const workflow=(await db.execute(sql`SELECT id,enabled,mode,trigger_event FROM merchant_automation_workflows WHERE id=${id} AND merchant_id=${ctx.merchantId}`)).rows[0] as Record<string,unknown>|undefined;
    if(!workflow)return fail(res,404,"Workflow not found");
    if(String(workflow.mode)!=="dry_run")return fail(res,409,"Preview tests are only available in Preview only mode; automatic and approval workflows require real domain events");
    const eventId=randomUUID();
    const count=await dispatchWorkflowEvent({
      eventId,eventType:String(workflow.trigger_event),aggregateType:"automation_workflow_test",aggregateId:String(workflow.id),
      merchantId:ctx.merchantId,payload:{manualTest:true,requestedBy:ctx.userId},before:{},after:{},source:"merchant_api",
    });
    res.json({dispatched:count,testEventId:eventId,note:"Manual runs use a synthetic, clearly marked test context; financial and external-publishing actions are not part of the workflow action allowlist."});
  }catch(e){next(e);}
});

export default router;
