import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { reserveAutomationActionInTransaction } from "./automation-guard";

export const WORKFLOW_TRIGGER_EVENTS = [
  "order.created","order.cancelled","payment.verified","payment.evidence_submitted","refund.processed",
  "invoice.sent","invoice.payment_submitted","invoice.payment_verified","inventory.adjusted","inventory.reserved",
  "inventory.released","inventory.committed","marketplace.listing_reviewed","marketplace.fee_reviewed",
  "advertising.payment_submitted","advertising.payment_confirmed","advertising.payment_reviewed",
  "ai.action_proposed","ai.action_approved","ai.action_executed","ai.action_rejected","ai.action_rolled_back",
  "location.created","location.updated","location.disabled","ts_pay.transfer_completed","ts_pay.transfer_received",
  "invitation.created","invitation.revoked","invitation.accepted","membership.role_changed","membership.scope_changed",
  "membership.status_changed","storefront.published","merchant.operation.created","merchant.operation.transitioned",
  "merchant.api_key.created","merchant.api_key.revoked","merchant.feature_flag.updated","merchant.experiment.updated",
  "merchant.accounting_period.updated","merchant.message.created","merchant.document.created","account.exported",
  "account.deleted","schedule.tick",
] as const;
export type WorkflowTriggerEvent = typeof WORKFLOW_TRIGGER_EVENTS[number];
const triggerSet = new Set<string>(WORKFLOW_TRIGGER_EVENTS);

const actionKinds = ["create_operation","create_message","set_feature_flag","log"] as const;
type ActionKind = typeof actionKinds[number];

type WorkflowContext = {
  eventId: string | null;
  eventType: string;
  aggregateType: string | null;
  aggregateId: string | null;
  merchantId: number;
  payload: Record<string, unknown>;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  source: string | null;
  scheduleKey?: string | null;
};

type Condition = {
  path: string;
  op?: "eq" | "neq" | "in" | "gt" | "gte" | "lt" | "lte" | "contains" | "exists";
  value?: unknown;
};

function getPath(context: WorkflowContext, path: string): unknown {
  const normalized = path.replace(/^\$/, "").trim();
  if (!normalized || normalized.length > 180) return undefined;
  const segments = normalized.split(".").filter(Boolean);
  let current: unknown = context;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    const object = current as Record<string, unknown>;
    if (!(segment in object)) return undefined;
    current = object[segment];
  }
  return current;
}
function comparable(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return null;
}
function conditionPasses(context: WorkflowContext, condition: Condition): boolean {
  if (!condition || typeof condition.path !== "string") return false;
  const actual = getPath(context, condition.path);
  const op = condition.op ?? "eq";
  switch (op) {
    case "exists": return actual !== undefined && actual !== null;
    case "eq": return JSON.stringify(actual) === JSON.stringify(condition.value);
    case "neq": return JSON.stringify(actual) !== JSON.stringify(condition.value);
    case "in": return Array.isArray(condition.value) && condition.value.some((value) => JSON.stringify(value) === JSON.stringify(actual));
    case "contains": {
      if (typeof actual === "string") return actual.toLowerCase().includes(String(condition.value ?? "").toLowerCase());
      if (Array.isArray(actual)) return actual.some((value) => JSON.stringify(value) === JSON.stringify(condition.value));
      return false;
    }
    case "gt": {
      const a = comparable(actual); const b = comparable(condition.value);
      return typeof a === "number" && typeof b === "number" ? a > b : String(a) > String(b);
    }
    case "gte": {
      const a = comparable(actual); const b = comparable(condition.value);
      return typeof a === "number" && typeof b === "number" ? a >= b : String(a) >= String(b);
    }
    case "lt": {
      const a = comparable(actual); const b = comparable(condition.value);
      return typeof a === "number" && typeof b === "number" ? a < b : String(a) < String(b);
    }
    case "lte": {
      const a = comparable(actual); const b = comparable(condition.value);
      return typeof a === "number" && typeof b === "number" ? a <= b : String(a) <= String(b);
    }
    default: return false;
  }
}
function conditionsPass(context: WorkflowContext, conditions: unknown): boolean {
  if (!Array.isArray(conditions)) return false;
  return conditions.every((condition) => conditionPasses(context, condition as Condition));
}
function boundedText(value: unknown, max: number, fallback = ""): string {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}
function safeAction(action: unknown): { kind: ActionKind; config: Record<string, unknown> } | null {
  if (!action || typeof action !== "object" || Array.isArray(action)) return null;
  const value = action as Record<string, unknown>;
  if (typeof value.kind !== "string" || !actionKinds.includes(value.kind as ActionKind)) return null;
  const config = value.config && typeof value.config === "object" && !Array.isArray(value.config) ? value.config as Record<string, unknown> : {};
  if (value.kind === "create_operation") {
    const allowedKinds = ["task","product_alert","support_ticket","lead","delivery_issue","supplier_issue"] as const;
    if (!allowedKinds.includes(String(config.kind) as typeof allowedKinds[number])) return null;
    if (!boundedText(config.title, 200)) return null;
  }
  if (value.kind === "create_message" && (!boundedText(config.subject, 200) || !boundedText(config.body, 4000))) return null;
  if (value.kind === "set_feature_flag" && !/^[a-zA-Z0-9._:-]{1,80}$/.test(boundedText(config.key, 80))) return null;
  return { kind: value.kind as ActionKind, config };
}
async function executeAction(
  tx: { execute: (query: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }> },
  workflowId: string,
  context: WorkflowContext,
  action: { kind: ActionKind; config: Record<string, unknown> },
) {
  if (action.kind === "log") return { kind: "log", recorded: true };
  await reserveAutomationActionInTransaction(tx, context.merchantId, "action");
  if (action.kind === "create_operation") {
    const title = boundedText(action.config.title, 200);
    const kind = boundedText(action.config.kind, 40);
    const description = boundedText(action.config.description, 4000, null as unknown as string) || null;
    const priority = ["low","normal","high","urgent"].includes(String(action.config.priority)) ? String(action.config.priority) : "normal";
    const reference = `wf:${workflowId}:event:${context.eventId ?? "schedule"}:${randomUUID()}`;
    const result = await tx.execute(sql`
      INSERT INTO merchant_operation_records
        (merchant_id,kind,status,title,description,priority,reference,created_by,updated_by)
      VALUES
        (${context.merchantId},${kind},'open',${title},${description},${priority},${reference},'automation','automation')
      RETURNING id,kind,status,title,reference
    `);
    return { kind: action.kind, operation: result.rows[0] ?? null };
  }
  if (action.kind === "create_message") {
    const thread = (await tx.execute(sql`
      INSERT INTO merchant_message_threads(merchant_id,subject,participant_type,status,created_by)
      VALUES(${context.merchantId},${boundedText(action.config.subject,200)},'internal','open','automation')
      RETURNING id
    `)).rows[0] as { id?: string } | undefined;
    if (!thread?.id) throw new Error("Automation message thread could not be created");
    await tx.execute(sql`
      INSERT INTO merchant_messages(thread_id,merchant_id,sender_id,body)
      VALUES(${thread.id},${context.merchantId},'automation',${boundedText(action.config.body,4000)})
    `);
    return { kind: action.kind, threadId: thread.id };
  }
  const key = boundedText(action.config.key,80);
  const enabled = action.config.enabled === true;
  const config = action.config.config && typeof action.config.config === "object" && !Array.isArray(action.config.config) ? action.config.config : {};
  await tx.execute(sql`
    INSERT INTO merchant_feature_flags(merchant_id,key,enabled,config,updated_by,updated_at)
    VALUES(${context.merchantId},${key},${enabled},${JSON.stringify(config)}::jsonb,'automation',now())
    ON CONFLICT (merchant_id,key) DO UPDATE
      SET enabled=EXCLUDED.enabled,config=EXCLUDED.config,updated_by=EXCLUDED.updated_by,updated_at=now()
  `);
  return { kind: action.kind, key, enabled };
}

export function isWorkflowTriggerEvent(value: unknown): value is WorkflowTriggerEvent {
  return typeof value === "string" && triggerSet.has(value);
}

export async function dispatchWorkflowEvent(context: WorkflowContext): Promise<number> {
  if (!Number.isInteger(context.merchantId) || context.merchantId <= 0) return 0;
  if (!isWorkflowTriggerEvent(context.eventType)) return 0;
  const workflows = await db.execute(sql`
    SELECT id,merchant_id,workflow_key,name,enabled,mode,trigger_event,conditions,actions,cooldown_seconds,daily_run_limit,
           version,last_run_at,next_scheduled_at,schedule_interval_seconds
    FROM merchant_automation_workflows
    WHERE merchant_id=${context.merchantId}
      AND enabled=true
      AND trigger_event=${context.eventType}
    ORDER BY created_at ASC
    LIMIT 100
  `);
  let handled = 0;
  for (const workflow of workflows.rows as Array<Record<string, unknown>>) {
    const workflowId = String(workflow.id);
    if (!conditionsPass(context, workflow.conditions)) continue;
    const idempotencyKey = `workflow:${workflowId}:event:${context.eventId ?? context.scheduleKey ?? "schedule"}:${context.eventType}`;
    await db.transaction(async (tx) => {
      const existing = await tx.execute(sql`SELECT id,status FROM merchant_automation_runs WHERE idempotency_key=${idempotencyKey} LIMIT 1 FOR UPDATE`);
      if (existing.rows.length) return;
      const cooldown = Number(workflow.cooldown_seconds ?? 0);
      if (cooldown > 0) {
        const recent = await tx.execute(sql`SELECT id FROM merchant_automation_runs WHERE workflow_id=${workflowId} AND created_at > now() - make_interval(secs => ${cooldown}) AND status IN ('completed','running','approval_required','dry_run') LIMIT 1`);
        if (recent.rows.length) {
          await tx.execute(sql`INSERT INTO merchant_automation_runs(workflow_id,merchant_id,event_id,status,idempotency_key,trigger_snapshot,result) VALUES(${workflowId},${context.merchantId},${context.eventId},'skipped',${idempotencyKey},${JSON.stringify(context)}::jsonb,JSON.stringify({reason:'cooldown'})::jsonb)`);
          return;
        }
      }
      const limit = Math.max(0, Math.min(10000, Number(workflow.daily_run_limit ?? 100)));
      const count = await tx.execute(sql`SELECT COUNT(*)::int AS count FROM merchant_automation_runs WHERE workflow_id=${workflowId} AND created_at >= CURRENT_DATE`);
      if (Number((count.rows[0] as { count?: number } | undefined)?.count ?? 0) >= limit) {
        await tx.execute(sql`INSERT INTO merchant_automation_runs(workflow_id,merchant_id,event_id,status,idempotency_key,trigger_snapshot,result) VALUES(${workflowId},${context.merchantId},${context.eventId},'skipped',${idempotencyKey},${JSON.stringify(context)}::jsonb,JSON.stringify({reason:'daily_limit'})::jsonb)`);
        return;
      }
      const actions = Array.isArray(workflow.actions) ? workflow.actions.map(safeAction) : [];
      if (actions.some((action) => !action)) {
        await tx.execute(sql`INSERT INTO merchant_automation_runs(workflow_id,merchant_id,event_id,status,idempotency_key,trigger_snapshot,result,error_code,error_message) VALUES(${workflowId},${context.merchantId},${context.eventId},'failed',${idempotencyKey},${JSON.stringify(context)}::jsonb,'{}'::jsonb,'invalid_action','Workflow contains an unsupported or invalid action')`);
        return;
      }
      const validActions = actions as Array<{kind:ActionKind;config:Record<string,unknown>}>;
      const mode = String(workflow.mode);
      if (mode === "dry_run") {
        await tx.execute(sql`INSERT INTO merchant_automation_runs(workflow_id,merchant_id,event_id,status,idempotency_key,trigger_snapshot,result) VALUES(${workflowId},${context.merchantId},${context.eventId},'dry_run',${idempotencyKey},${JSON.stringify(context)}::jsonb,${JSON.stringify({plannedActions:validActions.map((a)=>a.kind)})}::jsonb)`);
        return;
      }
      if (mode === "approval") {
        const inserted = await tx.execute(sql`INSERT INTO merchant_automation_runs(workflow_id,merchant_id,event_id,status,idempotency_key,trigger_snapshot,result) VALUES(${workflowId},${context.merchantId},${context.eventId},'approval_required',${idempotencyKey},${JSON.stringify(context)}::jsonb,${JSON.stringify({plannedActions:validActions.map((a)=>a.kind)})}::jsonb) RETURNING id`);
        const run = inserted.rows[0] as { id?: string } | undefined;
        if (!run?.id) throw new Error("Workflow approval run could not be recorded");
        await tx.execute(sql`INSERT INTO merchant_automation_action_approvals(run_id,merchant_id,status) VALUES(${run.id},${context.merchantId},'pending')`);
        return;
      }
      const started = await tx.execute(sql`INSERT INTO merchant_automation_runs(workflow_id,merchant_id,event_id,status,idempotency_key,trigger_snapshot,result,started_at) VALUES(${workflowId},${context.merchantId},${context.eventId},'running',${idempotencyKey},${JSON.stringify(context)}::jsonb,'{}'::jsonb,now()) RETURNING id`);
      const run = started.rows[0] as { id?: string } | undefined;
      if (!run?.id) throw new Error("Workflow run could not be started");
      const results: unknown[] = [];
      for (const action of validActions) results.push(await executeAction(tx, workflowId, context, action));
      await tx.execute(sql`UPDATE merchant_automation_runs SET status='completed',result=${JSON.stringify({actions:results})}::jsonb,completed_at=now() WHERE id=${run.id}`);
      await tx.execute(sql`UPDATE merchant_automation_workflows SET last_run_at=now(), next_scheduled_at=CASE WHEN trigger_event='schedule.tick' AND schedule_interval_seconds > 0 THEN now() + make_interval(secs => schedule_interval_seconds) ELSE next_scheduled_at END, updated_at=now() WHERE id=${workflowId}`);
      handled += 1;
    });
  }
  return handled;
}

export async function processScheduledWorkflows(limit = 25): Promise<number> {
  const result = await db.execute(sql`
    SELECT id,merchant_id,event_id,workflow_key
    FROM merchant_automation_workflows
    WHERE enabled=true AND trigger_event='schedule.tick'
      AND next_scheduled_at IS NOT NULL AND next_scheduled_at <= now()
    ORDER BY next_scheduled_at ASC
    LIMIT ${Math.max(1, Math.min(limit,100))}
  `);
  let processed = 0;
  for (const row of result.rows as Array<Record<string, unknown>>) {
    const context: WorkflowContext = {
      eventId: null, eventType: "schedule.tick", aggregateType: "automation_workflow",
      aggregateId: String(row.id), merchantId: Number(row.merchant_id), payload: { schedule: true, workflowId: String(row.id) },
      before: {}, after: {}, source: "scheduler",
    };
    const count = await dispatchWorkflowEvent(context);
    if (count || row.id) {
      await db.execute(sql`UPDATE merchant_automation_workflows SET next_scheduled_at=CASE WHEN schedule_interval_seconds > 0 THEN now() + make_interval(secs => schedule_interval_seconds) ELSE NULL END, updated_at=now() WHERE id=${row.id} AND enabled=true`);
      processed += count;
    }
  }
  return processed;
}

export type { WorkflowContext };


export async function approveWorkflowRun(runId: string, merchantId: number, reviewerId: string, note: string | null, approve: boolean) {
  if (!/^[0-9a-fA-F-]{36}$/.test(runId) || !Number.isInteger(merchantId) || merchantId <= 0) throw new Error("Invalid automation approval request");
  return db.transaction(async (tx) => {
    const row = (await tx.execute(sql`
      SELECT r.id,r.workflow_id,r.merchant_id,r.status,w.enabled,w.actions,w.mode
      FROM merchant_automation_runs r
      INNER JOIN merchant_automation_workflows w ON w.id=r.workflow_id AND w.merchant_id=r.merchant_id
      WHERE r.id=${runId} AND r.merchant_id=${merchantId}
      FOR UPDATE
    `)).rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("Automation run not found");
    const approval = (await tx.execute(sql`SELECT id,status FROM merchant_automation_action_approvals WHERE run_id=${runId} AND merchant_id=${merchantId} FOR UPDATE`)).rows[0] as Record<string, unknown> | undefined;
    if (!approval || approval.status !== "pending" || row.status !== "approval_required") throw new Error("Automation run is no longer awaiting approval");
    if (!approve) {
      await tx.execute(sql`UPDATE merchant_automation_action_approvals SET status='rejected',reviewer_id=${reviewerId},reviewed_at=now(),note=${note} WHERE run_id=${runId}`);
      await tx.execute(sql`UPDATE merchant_automation_runs SET status='skipped',result=${JSON.stringify({reason:"rejected"})}::jsonb,completed_at=now() WHERE id=${runId}`);
      return { status: "rejected" };
    }
    if (row.enabled !== true) throw new Error("Workflow is disabled; re-enable it before approving execution");
    const actions = Array.isArray(row.actions) ? row.actions.map(safeAction) : [];
    if (actions.some((action) => !action)) throw new Error("Workflow actions are no longer valid");
    await tx.execute(sql`UPDATE merchant_automation_action_approvals SET status='approved',reviewer_id=${reviewerId},reviewed_at=now(),note=${note} WHERE run_id=${runId}`);
    await tx.execute(sql`UPDATE merchant_automation_runs SET status='running',started_at=now() WHERE id=${runId}`);
    const results: unknown[] = [];
    const context = (await tx.execute(sql`SELECT trigger_snapshot FROM merchant_automation_runs WHERE id=${runId}`)).rows[0] as { trigger_snapshot?: WorkflowContext } | undefined;
    const workflowContext = context?.trigger_snapshot;
    if (!workflowContext || typeof workflowContext !== "object") throw new Error("Automation trigger context is unavailable");
    for (const action of actions as Array<{kind:ActionKind;config:Record<string,unknown>}>) results.push(await executeAction(tx,String(row.workflow_id),workflowContext,action));
    await tx.execute(sql`UPDATE merchant_automation_runs SET status='completed',result=${JSON.stringify({actions:results})}::jsonb,completed_at=now() WHERE id=${runId}`);
    await tx.execute(sql`UPDATE merchant_automation_workflows SET last_run_at=now(),updated_at=now() WHERE id=${row.workflow_id}`);
    return { status: "completed", results };
  });
}

export function startScheduledWorkflowWorker(intervalMs = 30000) {
  const timer = setInterval(() => {
    void processScheduledWorkflows().catch(() => undefined);
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
