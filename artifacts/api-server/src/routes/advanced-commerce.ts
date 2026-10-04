import { createHash, randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getAuth } from "../lib/auth-compat";
import { db, merchantsTable } from "@workspace/db";
import { requirePermission } from "../lib/tenant-access";

const router = Router();

const operationKinds = [
  "return","exchange","booking","event","ticket","quote","purchase_order","expense",
  "lead","task","support_ticket","message_thread","preorder","waitlist","product_alert",
  "document","customer_document","app_listing","theme_listing","creator_listing",
] as const;
type OperationKind = typeof operationKinds[number];

const permissionByKind: Record<OperationKind, "team.manage" | "customers.manage" | "finance.manage" | "orders.manage"> = {
  return: "orders.manage", exchange: "orders.manage", booking: "orders.manage", event: "orders.manage",
  ticket: "orders.manage", quote: "finance.manage", purchase_order: "finance.manage", expense: "finance.manage",
  lead: "customers.manage", task: "team.manage", support_ticket: "customers.manage", message_thread: "team.manage",
  preorder: "orders.manage", waitlist: "customers.manage", product_alert: "customers.manage",
  document: "team.manage", customer_document: "customers.manage", app_listing: "team.manage",
  theme_listing: "team.manage", creator_listing: "team.manage",
};

const initialStatus: Record<OperationKind, string> = {
  return: "pending", exchange: "pending", booking: "scheduled", event: "draft", ticket: "open",
  quote: "draft", purchase_order: "draft", expense: "pending", lead: "open", task: "open",
  support_ticket: "open", message_thread: "open", preorder: "pending", waitlist: "open",
  product_alert: "open", document: "active", customer_document: "active", app_listing: "pending",
  theme_listing: "pending", creator_listing: "pending",
};

const transitions: Record<OperationKind, Record<string, string[]>> = {
  return: { pending:["approved","rejected"], approved:["completed","cancelled"], rejected:[], completed:[], cancelled:[] },
  exchange: { pending:["approved","rejected"], approved:["completed","cancelled"], rejected:[], completed:[], cancelled:[] },
  booking: { scheduled:["in_progress","cancelled"], in_progress:["completed","cancelled"], completed:[], cancelled:[] },
  event: { draft:["scheduled","cancelled"], scheduled:["active","cancelled"], active:["completed","cancelled"], completed:[], cancelled:[] },
  ticket: { open:["in_progress","resolved","closed"], in_progress:["resolved","closed"], resolved:["closed"], closed:[] },
  quote: { draft:["pending","cancelled"], pending:["approved","rejected"], approved:["completed","cancelled"], rejected:["draft"], completed:[], cancelled:[] },
  purchase_order: { draft:["pending","cancelled"], pending:["approved","rejected"], approved:["completed","cancelled"], rejected:["draft"], completed:[], cancelled:[] },
  expense: { pending:["approved","rejected"], approved:["completed"], rejected:["pending"], completed:[] },
  lead: { open:["in_progress","resolved","closed"], in_progress:["resolved","closed"], resolved:["closed"], closed:[] },
  task: { open:["in_progress","completed","cancelled"], in_progress:["completed","cancelled"], completed:[], cancelled:[] },
  support_ticket: { open:["in_progress","resolved","closed"], in_progress:["resolved","closed"], resolved:["closed"], closed:[] },
  message_thread: { open:["closed","archived"], closed:["archived"], archived:[] },
  preorder: { pending:["approved","cancelled"], approved:["completed","cancelled"], completed:[], cancelled:[] },
  waitlist: { open:["closed"], closed:[] },
  product_alert: { open:["resolved","closed"], resolved:["closed"], closed:[] },
  document: { active:["archived"], archived:[] },
  customer_document: { active:["archived"], archived:[] },
  app_listing: { pending:["approved","rejected"], approved:["archived"], rejected:["pending"], archived:[] },
  theme_listing: { pending:["approved","rejected"], approved:["archived"], rejected:["pending"], archived:[] },
  creator_listing: { pending:["approved","rejected"], approved:["archived"], rejected:["pending"], archived:[] },
};

async function merchantFor(req: Request, permission: "team.manage" | "customers.manage" | "finance.manage") {
  const userId = getAuth(req).userId;
  if (!userId) return null;
  const merchant = (await db.execute(sql`
    SELECT id,email FROM merchants
    WHERE status='active'
      AND (clerk_user_id=${userId} OR local_auth_user_id=${userId})
    LIMIT 1
  `)).rows[0] as { id:number; email:string } | undefined;
  if (!merchant) return null;
  await requirePermission(userId, merchant.id, permission);
  return { ...merchant, userId };
}

function fail(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

function isKind(value: unknown): value is OperationKind {
  return typeof value === "string" && (operationKinds as readonly string[]).includes(value);
}

router.get("/merchant/operations", async (req, res, next) => {
  try {
    const requestedKind = typeof req.query.kind === "string" ? req.query.kind : "";
    if (requestedKind && !isKind(requestedKind)) return fail(res, 400, "Unsupported operation kind");
    const merchant = await merchantFor(req, "team.manage");
    if (!merchant) return fail(res, 401, "Authentication required");
    const conditions = requestedKind
      ? sql`merchant_id=${merchant.id} AND kind=${requestedKind}`
      : sql`merchant_id=${merchant.id}`;
    const result = await db.execute(sql`
      SELECT id,merchant_id,kind,status,title,description,priority,customer_id,order_id,related_type,related_id,
             reference,amount_minor,currency,starts_at,ends_at,due_at,payload,created_by,updated_by,created_at,updated_at
      FROM merchant_operation_records
      WHERE ${conditions}
      ORDER BY updated_at DESC
      LIMIT 250
    `);
    res.json({ operations: result.rows });
  } catch (error) { next(error); }
});

router.post("/merchant/operations", async (req, res, next) => {
  try {
    const kind = req.body?.kind;
    if (!isKind(kind)) return fail(res, 400, "Unsupported operation kind");
    const merchant = await merchantFor(req, permissionByKind[kind]);
    if (!merchant) return fail(res, 401, "Authentication required");
    const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 200) : "";
    if (!title) return fail(res, 400, "A title is required");
    const description = typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 4000) : null;
    const priority = ["low","normal","high","urgent"].includes(req.body?.priority) ? req.body.priority : "normal";
    const reference = typeof req.body?.reference === "string" ? req.body.reference.trim().slice(0, 120) || null : null;
    const relatedType = typeof req.body?.relatedType === "string" ? req.body.relatedType.trim().slice(0, 80) || null : null;
    const relatedId = typeof req.body?.relatedId === "string" ? req.body.relatedId.trim().slice(0, 160) || null : null;
    const customerId = Number.isInteger(Number(req.body?.customerId)) ? Number(req.body.customerId) : null;
    const orderId = Number.isInteger(Number(req.body?.orderId)) ? Number(req.body.orderId) : null;
    const amount = req.body?.amount === undefined || req.body?.amount === null ? null : Number(req.body.amount);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000)) return fail(res, 400, "Invalid amount");
    const startsAt = typeof req.body?.startsAt === "string" ? new Date(req.body.startsAt) : null;
    const endsAt = typeof req.body?.endsAt === "string" ? new Date(req.body.endsAt) : null;
    const dueAt = typeof req.body?.dueAt === "string" ? new Date(req.body.dueAt) : null;
    for (const date of [startsAt, endsAt, dueAt]) if (date && Number.isNaN(date.getTime())) return fail(res, 400, "Invalid date");
    const payload = req.body?.payload && typeof req.body.payload === "object" && !Array.isArray(req.body.payload) ? req.body.payload : {};
    const [row] = await db.execute(sql`
      INSERT INTO merchant_operation_records
        (merchant_id,kind,status,title,description,priority,customer_id,order_id,related_type,related_id,reference,amount_minor,currency,starts_at,ends_at,due_at,payload,created_by,updated_by)
      VALUES
        (${merchant.id},${kind},${initialStatus[kind]},${title},${description},${priority},
         ${customerId},${orderId},${relatedType},${relatedId},${reference},
         ${amount === null ? null : Math.round(amount * 100)},${typeof req.body?.currency === "string" ? req.body.currency.toUpperCase().slice(0,3) : null},
         ${startsAt},${endsAt},${dueAt},${JSON.stringify(payload)}::jsonb,${merchant.userId},${merchant.userId})
      RETURNING *
    `);
    const created = (row as Record<string, unknown>) ?? null;
    if (!created) return fail(res, 500, "Operation could not be created");
    await db.execute(sql`
      INSERT INTO merchant_operation_events(operation_id,merchant_id,from_status,to_status,actor_id,reason)
      VALUES(${created.id},${merchant.id},NULL,${String(created.status)},${merchant.userId},'created')
    `);
    res.status(201).json({ operation: created });
  } catch (error) {
    next(error);
  }
});

router.post("/merchant/operations/:id/transition", async (req, res, next) => {
  try {
    const id = String(req.params.id ?? "").trim();
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return fail(res, 400, "Invalid operation id");
    const current = (await db.execute(sql`SELECT * FROM merchant_operation_records WHERE id=${id} LIMIT 1`)).rows[0] as Record<string, unknown> | undefined;
    if (!current) return fail(res, 404, "Operation not found");
    const kind = current.kind as OperationKind;
    if (!isKind(kind)) return fail(res, 500, "Stored operation kind is invalid");
    const merchant = await merchantFor(req, permissionByKind[kind]);
    if (!merchant || Number(current.merchant_id) !== merchant.id) return fail(res, 403, "Operation belongs to another merchant");
    const toStatus = typeof req.body?.status === "string" ? req.body.status.trim() : "";
    if (!transitions[kind]?.[String(current.status)]?.includes(toStatus)) return fail(res, 409, `Invalid transition from ${String(current.status)} to ${toStatus}`);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : null;
    const updated = await db.transaction(async (tx) => {
      const locked = (await tx.execute(sql`SELECT status FROM merchant_operation_records WHERE id=${id} AND merchant_id=${merchant.id} FOR UPDATE`)).rows[0] as { status?: string } | undefined;
      if (!locked || locked.status !== current.status) throw new Error("Operation changed concurrently; reload and retry");
      const result = await tx.execute(sql`UPDATE merchant_operation_records SET status=${toStatus},updated_by=${merchant.userId},updated_at=now() WHERE id=${id} AND merchant_id=${merchant.id} RETURNING *`);
      const next = result.rows[0] as Record<string, unknown> | undefined;
      if (!next) throw new Error("Operation transition failed");
      await tx.execute(sql`INSERT INTO merchant_operation_events(operation_id,merchant_id,from_status,to_status,actor_id,reason) VALUES(${id},${merchant.id},${String(current.status)},${toStatus},${merchant.userId},${reason})`);
      return next;
    });
    res.json({ operation: updated });
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "Operation transition failed" });
  }
});

router.get("/merchant/operations/:id/events", async (req, res, next) => {
  try {
    const id = String(req.params.id ?? "").trim();
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return fail(res, 400, "Invalid operation id");
    const current = (await db.execute(sql`SELECT kind FROM merchant_operation_records WHERE id=${id} LIMIT 1`)).rows[0] as { kind?: string } | undefined;
    if (!current || !isKind(current.kind)) return fail(res, 404, "Operation not found");
    const merchant = await merchantFor(req, permissionByKind[current.kind]);
    if (!merchant) return fail(res, 401, "Authentication required");
    const events = await db.execute(sql`SELECT id,from_status,to_status,actor_id,reason,created_at FROM merchant_operation_events WHERE operation_id=${id} AND merchant_id=${merchant.id} ORDER BY created_at DESC`);
    res.json({ events: events.rows });
  } catch (error) { next(error); }
});

router.get("/merchant/api-keys", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "team.manage");
    if (!merchant) return fail(res, 401, "Authentication required");
    const rows = await db.execute(sql`SELECT id,name,key_prefix,scopes,last_used_at,expires_at,revoked_at,created_at FROM merchant_api_keys WHERE merchant_id=${merchant.id} ORDER BY created_at DESC`);
    res.json({ keys: rows.rows });
  } catch (error) { next(error); }
});

router.post("/merchant/api-keys", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "team.manage");
    if (!merchant) return fail(res, 401, "Authentication required");
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : "";
    if (!name) return fail(res, 400, "API key name is required");
    const allowedScopes = ["api.read","api.write","webhooks.read","webhooks.write"];
    const scopes = Array.isArray(req.body?.scopes)
      ? [...new Set(req.body.scopes.filter((v: unknown): v is string => typeof v === "string" && allowedScopes.includes(v)))].slice(0, 20)
      : ["api.read"];
    const raw = `lun_${randomBytes(28).toString("base64url")}`;
    const hash = createHash("sha256").update(raw).digest("hex");
    const prefix = raw.slice(0, 12);
    const [row] = await db.execute(sql`
      INSERT INTO merchant_api_keys(merchant_id,name,key_prefix,key_hash,scopes,created_by)
      VALUES(${merchant.id},${name},${prefix},${hash},${JSON.stringify(scopes)}::jsonb,${merchant.userId})
      RETURNING id,name,key_prefix,scopes,created_at
    `);
    if (!row) return fail(res, 409, "API key could not be created");
    res.status(201).json({ key: raw, metadata: row });
  } catch (error) { next(error); }
});

router.post("/merchant/api-keys/:id/revoke", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "team.manage");
    const id = String(req.params.id ?? "").trim();
    if (!merchant || !/^[0-9a-fA-F-]{36}$/.test(id)) return fail(res, 401, "Authentication required");
    const result = await db.execute(sql`UPDATE merchant_api_keys SET revoked_at=now() WHERE id=${id} AND merchant_id=${merchant.id} AND revoked_at IS NULL RETURNING id,name,revoked_at`);
    if (!result.rows.length) return fail(res, 404, "Active API key not found");
    res.json({ key: result.rows[0] });
  } catch (error) { next(error); }
});

router.get("/developer/whoami", async (req, res): Promise<void> => {
  const authorization = typeof req.get("authorization") === "string" ? req.get("authorization")!.trim() : "";
  const match = authorization.match(/^Bearer\s+(lun_[A-Za-z0-9_-]{20,200})$/);
  if (!match) { res.status(401).json({ error: "Valid Lunavo API key is required." }); return; }
  const hash = createHash("sha256").update(match[1]).digest("hex");
  const result = await db.execute(sql`
    SELECT id,merchant_id,name,scopes,expires_at,revoked_at
    FROM merchant_api_keys
    WHERE key_hash=${hash}
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1
  `);
  const key = result.rows[0] as {id:string;merchant_id:number;name:string;scopes:unknown;expires_at:string|null}|undefined;
  if (!key) { res.status(401).json({ error: "API key is invalid, revoked or expired." }); return; }
  await db.execute(sql`UPDATE merchant_api_keys SET last_used_at=now() WHERE id=${key.id}`);
  res.json({ authenticated:true, merchantId:key.merchant_id, keyName:key.name, scopes:key.scopes, expiresAt:key.expires_at });
});

router.get("/merchant/feature-flags", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "team.manage");
    if (!merchant) return fail(res, 401, "Authentication required");
    const rows = await db.execute(sql`SELECT key,enabled,config,updated_at FROM merchant_feature_flags WHERE merchant_id=${merchant.id} ORDER BY key`);
    res.json({ flags: rows.rows });
  } catch (error) { next(error); }
});

router.put("/merchant/feature-flags/:key", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "team.manage");
    const key = String(req.params.key ?? "").trim().toLowerCase();
    if (!merchant) return fail(res, 401, "Authentication required");
    if (!/^[a-z0-9][a-z0-9._-]{1,80}$/.test(key)) return fail(res, 400, "Invalid feature flag key");
    const enabled = req.body?.enabled === true;
    const config = req.body?.config && typeof req.body.config === "object" && !Array.isArray(req.body.config) ? req.body.config : {};
    const result = await db.execute(sql`
      INSERT INTO merchant_feature_flags(merchant_id,key,enabled,config,updated_by,updated_at)
      VALUES(${merchant.id},${key},${enabled},${JSON.stringify(config)}::jsonb,${merchant.userId},now())
      ON CONFLICT (merchant_id,key) DO UPDATE SET enabled=EXCLUDED.enabled,config=EXCLUDED.config,updated_by=EXCLUDED.updated_by,updated_at=now()
      RETURNING key,enabled,config,updated_at
    `);
    res.json({ flag: result.rows[0] });
  } catch (error) { next(error); }
});

router.get("/merchant/experiments", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "team.manage");
    if (!merchant) return fail(res, 401, "Authentication required");
    const rows = await db.execute(sql`SELECT id,key,name,status,variants,hypothesis,metrics,started_at,ended_at,created_at,updated_at FROM merchant_experiments WHERE merchant_id=${merchant.id} ORDER BY created_at DESC`);
    res.json({ experiments: rows.rows });
  } catch (error) { next(error); }
});

router.post("/merchant/experiments", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "team.manage");
    if (!merchant) return fail(res, 401, "Authentication required");
    const key = typeof req.body?.key === "string" ? req.body.key.trim().toLowerCase() : "";
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 160) : "";
    if (!/^[a-z0-9][a-z0-9_-]{1,80}$/.test(key) || !name) return fail(res, 400, "Valid experiment key and name are required");
    const variants = Array.isArray(req.body?.variants) ? req.body.variants : [{"key":"control","weight":50},{"key":"variant","weight":50}];
    const normalized = variants.slice(0, 8).flatMap((v: unknown) => {
      if (!v || typeof v !== "object") return [];
      const row = v as Record<string, unknown>;
      const variantKey = typeof row.key === "string" ? row.key.trim().slice(0, 80) : "";
      const weight = Number(row.weight);
      return variantKey && Number.isFinite(weight) && weight > 0 ? [{ key: variantKey, weight }] : [];
    });
    if (!normalized.length || normalized.reduce((sum, v) => sum + v.weight, 0) <= 0) return fail(res, 400, "Experiment must define positive variant weights");
    const result = await db.execute(sql`
      INSERT INTO merchant_experiments(merchant_id,key,name,status,variants,hypothesis,metrics,created_by)
      VALUES(${merchant.id},${key},${name},'draft',${JSON.stringify(normalized)}::jsonb,${typeof req.body?.hypothesis === "string" ? req.body.hypothesis.slice(0,1000) : null},${JSON.stringify(Array.isArray(req.body?.metrics) ? req.body.metrics.slice(0,20) : [])}::jsonb,${merchant.userId})
      ON CONFLICT (merchant_id,key) DO NOTHING
      RETURNING *
    `);
    if (!result.rows.length) return fail(res, 409, "Experiment key already exists");
    res.status(201).json({ experiment: result.rows[0] });
  } catch (error) { next(error); }
});

router.post("/merchant/experiments/:id/status", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "team.manage");
    const id = String(req.params.id ?? "").trim();
    if (!merchant || !/^[0-9a-fA-F-]{36}$/.test(id)) return fail(res, 401, "Authentication required");
    const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
    if (!["draft","active","paused","completed"].includes(status)) return fail(res, 400, "Invalid experiment status");
    const result = await db.execute(sql`UPDATE merchant_experiments SET status=${status},started_at=CASE WHEN ${status}='active' AND started_at IS NULL THEN now() ELSE started_at END,ended_at=CASE WHEN ${status}='completed' THEN now() ELSE ended_at END,updated_at=now() WHERE id=${id} AND merchant_id=${merchant.id} RETURNING id,key,status,started_at,ended_at,updated_at`);
    if (!result.rows.length) return fail(res, 404, "Experiment not found");
    res.json({ experiment: result.rows[0] });
  } catch (error) { next(error); }
});

router.post("/merchant/experiments/:id/assign", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "team.manage");
    const id = String(req.params.id ?? "").trim();
    const subjectKey = typeof req.body?.subjectKey === "string" ? req.body.subjectKey.trim().slice(0, 200) : "";
    if (!merchant || !/^[0-9a-fA-F-]{36}$/.test(id) || !subjectKey) return fail(res, 400, "Experiment and subject are required");
    const result = await db.execute(sql`SELECT variants,status FROM merchant_experiments WHERE id=${id} AND merchant_id=${merchant.id} LIMIT 1`);
    const experiment = result.rows[0] as { variants?: unknown; status?: string } | undefined;
    if (!experiment) return fail(res, 404, "Experiment not found");
    if (experiment.status !== "active") return fail(res, 409, "Experiment is not active");
    const variants = Array.isArray(experiment.variants) ? experiment.variants.filter((v): v is { key?: unknown; weight?: unknown } => !!v && typeof v === "object") : [];
    const total = variants.reduce((sum, v) => sum + Math.max(0, Number(v.weight) || 0), 0);
    if (total <= 0) return fail(res, 409, "Experiment has no valid weights");
    const digest = createHash("sha256").update(`${merchant.id}:${id}:${subjectKey}`).digest();
    const bucket = digest.readUInt32BE(0) / 0xFFFFFFFF * total;
    let cursor = 0;
    let selected = String(variants.at(-1)?.key ?? "control");
    for (const variant of variants) {
      cursor += Math.max(0, Number(variant.weight) || 0);
      if (bucket < cursor) { selected = String(variant.key ?? "control"); break; }
    }
    await db.execute(sql`
      INSERT INTO merchant_experiment_assignments(experiment_id,merchant_id,subject_key,variant_key)
      VALUES(${id},${merchant.id},${subjectKey},${selected})
      ON CONFLICT (experiment_id,subject_key) DO NOTHING
    `);
    const assigned = await db.execute(sql`SELECT variant_key,assigned_at FROM merchant_experiment_assignments WHERE experiment_id=${id} AND merchant_id=${merchant.id} AND subject_key=${subjectKey} LIMIT 1`);
    res.json({ experimentId:id,subjectKey,variant:assigned.rows[0]?.variant_key ?? selected,assignedAt:assigned.rows[0]?.assigned_at ?? null });
  } catch (error) { next(error); }
});

router.get("/merchant/accounting-periods", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "finance.read");
    if (!merchant) return fail(res, 401, "Authentication required");
    const rows = await db.execute(sql`SELECT id,period_key,start_date,end_date,status,closed_by,closed_at,created_at,updated_at FROM merchant_accounting_periods WHERE merchant_id=${merchant.id} ORDER BY start_date DESC`);
    res.json({ periods: rows.rows });
  } catch (error) { next(error); }
});

router.post("/merchant/accounting-periods", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "finance.manage");
    if (!merchant) return fail(res, 401, "Authentication required");
    const key = typeof req.body?.periodKey === "string" ? req.body.periodKey.trim().slice(0, 80) : "";
    const startDate = typeof req.body?.startDate === "string" ? req.body.startDate : "";
    const endDate = typeof req.body?.endDate === "string" ? req.body.endDate : "";
    if (!/^[A-Za-z0-9._-]{2,80}$/.test(key) || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) return fail(res, 400, "Valid accounting period dates are required");
    const result = await db.execute(sql`INSERT INTO merchant_accounting_periods(merchant_id,period_key,start_date,end_date,status,created_by) VALUES(${merchant.id},${key},${startDate},${endDate},'open',${merchant.userId}) ON CONFLICT DO NOTHING RETURNING *`);
    if (!result.rows.length) return fail(res, 409, "An identical accounting period already exists");
    res.status(201).json({ period: result.rows[0] });
  } catch (error) { next(error); }
});

router.post("/merchant/accounting-periods/:id/transition", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "finance.manage");
    const id = String(req.params.id ?? "").trim();
    const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
    if (!merchant || !/^[0-9a-fA-F-]{36}$/.test(id)) return fail(res, 401, "Authentication required");
    const allowed: Record<string,string[]> = { open:["closed"], closed:["locked"], locked:[] };
    const current = (await db.execute(sql`SELECT status FROM merchant_accounting_periods WHERE id=${id} AND merchant_id=${merchant.id} LIMIT 1`)).rows[0] as { status?:string } | undefined;
    if (!current || !allowed[current.status ?? ""]?.includes(status)) return fail(res, 409, "Invalid accounting-period transition");
    const result = await db.execute(sql`UPDATE merchant_accounting_periods SET status=${status},closed_by=${status==='closed'?merchant.userId:null},closed_at=${status==='closed'?sql`now()`:sql`closed_at`},updated_at=now() WHERE id=${id} AND merchant_id=${merchant.id} RETURNING *`);
    res.json({ period: result.rows[0] });
  } catch (error) { next(error); }
});

router.get("/merchant/message-threads", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "team.manage");
    if (!merchant) return fail(res, 401, "Authentication required");
    const rows = await db.execute(sql`SELECT id,subject,participant_type,participant_id,status,created_by,created_at,updated_at FROM merchant_message_threads WHERE merchant_id=${merchant.id} ORDER BY updated_at DESC LIMIT 100`);
    res.json({ threads: rows.rows });
  } catch (error) { next(error); }
});

router.post("/merchant/message-threads", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "team.manage");
    if (!merchant) return fail(res, 401, "Authentication required");
    const subject = typeof req.body?.subject === "string" ? req.body.subject.trim().slice(0, 200) : null;
    const participantType = typeof req.body?.participantType === "string" ? req.body.participantType.trim().slice(0, 60) : "internal";
    const participantId = typeof req.body?.participantId === "string" ? req.body.participantId.trim().slice(0, 160) : null;
    const result = await db.execute(sql`INSERT INTO merchant_message_threads(merchant_id,subject,participant_type,participant_id,created_by) VALUES(${merchant.id},${subject},${participantType},${participantId},${merchant.userId}) RETURNING *`);
    res.status(201).json({ thread: result.rows[0] });
  } catch (error) { next(error); }
});

router.post("/merchant/message-threads/:id/messages", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "team.manage");
    const threadId = String(req.params.id ?? "").trim();
    const body = typeof req.body?.body === "string" ? req.body.body.trim().slice(0, 5000) : "";
    if (!merchant || !/^[0-9a-fA-F-]{36}$/.test(threadId) || !body) return fail(res, 400, "Thread and message body are required");
    const owns = await db.execute(sql`SELECT id FROM merchant_message_threads WHERE id=${threadId} AND merchant_id=${merchant.id} LIMIT 1`);
    if (!owns.rows.length) return fail(res, 404, "Message thread not found");
    const result = await db.execute(sql`INSERT INTO merchant_messages(thread_id,merchant_id,sender_id,body,attachment_metadata) VALUES(${threadId},${merchant.id},${merchant.userId},${body},${JSON.stringify(Array.isArray(req.body?.attachments)?req.body.attachments.slice(0,10):[])}::jsonb) RETURNING id,sender_id,body,created_at`);
    await db.execute(sql`UPDATE merchant_message_threads SET updated_at=now() WHERE id=${threadId} AND merchant_id=${merchant.id}`);
    res.status(201).json({ message: result.rows[0] });
  } catch (error) { next(error); }
});

router.get("/merchant/message-threads/:id/messages", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "team.manage");
    const threadId = String(req.params.id ?? "").trim();
    if (!merchant || !/^[0-9a-fA-F-]{36}$/.test(threadId)) return fail(res, 401, "Authentication required");
    const owns = await db.execute(sql`SELECT id FROM merchant_message_threads WHERE id=${threadId} AND merchant_id=${merchant.id} LIMIT 1`);
    if (!owns.rows.length) return fail(res, 404, "Message thread not found");
    const messages = await db.execute(sql`SELECT id,sender_id,body,attachment_metadata,created_at FROM merchant_messages WHERE thread_id=${threadId} AND merchant_id=${merchant.id} ORDER BY created_at ASC LIMIT 500`);
    res.json({ messages: messages.rows });
  } catch (error) { next(error); }
});

router.get("/merchant/documents", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "team.manage");
    if (!merchant) return fail(res, 401, "Authentication required");
    const rows = await db.execute(sql`SELECT id,document_kind,title,entity_type,entity_id,media_asset_id,mime_type,byte_size,sha256,metadata,created_by,created_at FROM merchant_documents WHERE merchant_id=${merchant.id} ORDER BY created_at DESC LIMIT 500`);
    res.json({ documents: rows.rows });
  } catch (error) { next(error); }
});

router.post("/merchant/documents", async (req, res, next) => {
  try {
    const merchant = await merchantFor(req, "team.manage");
    if (!merchant) return fail(res, 401, "Authentication required");
    const kind = typeof req.body?.documentKind === "string" ? req.body.documentKind.trim().slice(0, 80) : "";
    const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 200) : "";
    if (!kind || !title) return fail(res, 400, "Document kind and title are required");
    const byteSize = req.body?.byteSize === undefined ? null : Number(req.body.byteSize);
    if (byteSize !== null && (!Number.isFinite(byteSize) || byteSize < 0 || byteSize > 100_000_000)) return fail(res, 400, "Invalid document size");
    const result = await db.execute(sql`INSERT INTO merchant_documents(merchant_id,document_kind,title,entity_type,entity_id,media_asset_id,mime_type,byte_size,sha256,metadata,created_by) VALUES(${merchant.id},${kind},${title},${typeof req.body?.entityType === "string" ? req.body.entityType.slice(0,80) : null},${typeof req.body?.entityId === "string" ? req.body.entityId.slice(0,160) : null},${typeof req.body?.mediaAssetId === "string" ? req.body.mediaAssetId.slice(0,160) : null},${typeof req.body?.mimeType === "string" ? req.body.mimeType.slice(0,120) : null},${byteSize},${typeof req.body?.sha256 === "string" ? req.body.sha256.trim().slice(0,64) : null},${JSON.stringify(req.body?.metadata && typeof req.body.metadata === "object" && !Array.isArray(req.body.metadata) ? req.body.metadata : {})}::jsonb,${merchant.userId}) RETURNING *`);
    res.status(201).json({ document: result.rows[0] });
  } catch (error) { next(error); }
});

export default router;
