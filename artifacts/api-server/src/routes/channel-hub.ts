import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, merchantsTable } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { decryptSecret, encryptSecret } from "../lib/withdrawal-security";
import { ChannelGatewayError, channelGatewayConfigured, channelGatewayRequest } from "../lib/channel-gateway-client";
import { requirePermission } from "../lib/tenant-access";

const router = Router();
const PROVIDERS = ["shopify","woocommerce","etsy","amazon","tiktok_shop","wix","squarespace","custom"] as const;
const RESOURCES = ["products","inventory","pricing","orders","fulfillment","returns"] as const;
const DIRECTIONS = ["pull","push"] as const;

function txt(value: unknown, max = 500): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}
function bool(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}
function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function quote(value: string | null): string {
  if (value === null) return "NULL";
  if (value.includes(String.fromCharCode(0))) throw new Error("Invalid null byte");
  return "'" + value.replaceAll("'", "''") + "'";
}
function safeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function merchantFor(req: Request, res: Response) {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const userSql = "SELECT id FROM merchants WHERE status='active' AND (clerk_user_id=" +
    quote(userId) + " OR local_auth_user_id=" + quote(userId) + ") LIMIT 1";
  const row = (await db.execute(sql.raw(userSql))).rows[0] as { id: number } | undefined;
  if (!row) {
    res.status(404).json({ error: "Merchant workspace not found" });
    return null;
  }
  try {
    await requirePermission(userId, row.id, "marketplace.manage");
  } catch {
    res.status(403).json({ error: "Channel management permission required" });
    return null;
  }
  return { merchantId: row.id, userId };
}

function serialize(row: Record<string, unknown>) {
  return {
    id: row.id,
    provider: row.provider,
    displayName: row.display_name,
    status: row.status,
    storeUrl: row.store_url,
    externalAccountRef: row.external_account_ref,
    sync: {
      products: row.sync_products,
      inventory: row.sync_inventory,
      orders: row.sync_orders,
      fulfillment: row.sync_fulfillment,
      pricing: row.sync_pricing,
    },
    lastSync: {
      products: row.last_product_sync_at,
      inventory: row.last_inventory_sync_at,
      orders: row.last_order_sync_at,
      fulfillment: row.last_fulfillment_sync_at,
    },
    lastError: row.last_error,
    credentialConfigured: Boolean(row.credential_configured),
    webhookConfigured: Boolean(row.webhook_configured),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get("/merchant/channels", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const query = [
      "SELECT c.*,",
      "(c.encrypted_access_token IS NOT NULL AND c.encrypted_access_token <> '') AS credential_configured,",
      "(c.encrypted_webhook_secret IS NOT NULL AND c.encrypted_webhook_secret <> '') AS webhook_configured",
      "FROM merchant_channel_connections c",
      "WHERE c.merchant_id = " + String(ctx.merchantId),
      "ORDER BY c.created_at DESC",
    ].join(" ");
    const rows = await db.execute(sql.raw(query));
    res.setHeader("Cache-Control", "no-store");
    res.json({
      adapterGatewayConfigured: channelGatewayConfigured(),
      providers: PROVIDERS.map(provider => ({
        provider,
        adapterState: channelGatewayConfigured() ? "capability-verified-on-connect" : "private-adapter-gateway-not-configured",
      })),
      connections: rows.rows.map(row => serialize(row as Record<string, unknown>)),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/merchant/channels", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const provider = txt(req.body?.provider, 40);
    const displayName = txt(req.body?.displayName, 120);
    const storeUrl = txt(req.body?.storeUrl, 2048);
    const externalAccountRef = txt(req.body?.externalAccountRef, 250);
    const accessToken = txt(req.body?.accessToken, 4000);
    const refreshToken = txt(req.body?.refreshToken, 4000);
    const webhookSecret = txt(req.body?.webhookSecret, 4000);

    if (!provider || !PROVIDERS.includes(provider as typeof PROVIDERS[number])) {
      res.status(400).json({ error: "Unsupported channel provider" });
      return;
    }
    if (!displayName) {
      res.status(400).json({ error: "Channel display name is required" });
      return;
    }
    if (storeUrl && !/^https?:\/\/[^\\s]+$/i.test(storeUrl)) {
      res.status(400).json({ error: "Channel store URL must be HTTP(S)" });
      return;
    }
    const metadata = req.body?.metadata && typeof req.body.metadata === "object" && !Array.isArray(req.body.metadata)
      ? JSON.stringify(req.body.metadata) : "{}";

    const query = [
      "INSERT INTO merchant_channel_connections",
      "(merchant_id,provider,display_name,status,encrypted_access_token,encrypted_refresh_token,encrypted_webhook_secret,webhook_secret_hash,store_url,external_account_ref,sync_products,sync_inventory,sync_orders,sync_fulfillment,sync_pricing,created_by,metadata)",
      "VALUES (",
      String(ctx.merchantId) + "," + quote(provider) + "," + quote(displayName) + ",'draft',",
      accessToken ? quote(encryptSecret(accessToken)) : "NULL", ",",
      refreshToken ? quote(encryptSecret(refreshToken)) : "NULL", ",",
      webhookSecret ? quote(encryptSecret(webhookSecret)) : "NULL", ",",
      webhookSecret ? quote(hash(webhookSecret)) : "NULL", ",",
      quote(storeUrl) + "," + quote(externalAccountRef) + ",",
      bool(req.body?.syncProducts) ? "TRUE," : "FALSE,",
      bool(req.body?.syncInventory) ? "TRUE," : "FALSE,",
      bool(req.body?.syncOrders) ? "TRUE," : "FALSE,",
      bool(req.body?.syncFulfillment) ? "TRUE," : "FALSE,",
      bool(req.body?.syncPricing) ? "TRUE," : "FALSE,",
      quote(ctx.userId) + "," + quote(metadata) + "::jsonb",
      ") RETURNING *",
    ].join(" ");
    const result = await db.execute(sql.raw(query));
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      res.status(500).json({ error: "Channel connection could not be created" });
      return;
    }

    res.status(201).json({
      connection: serialize({ ...row, credential_configured: Boolean(accessToken), webhook_configured: Boolean(webhookSecret) }),
      syncQueued: [],
      nextStep: "Run connection test before syncing. External jobs are not marked successful until the self-hosted provider adapter confirms the provider result and local commit.",
    });
  } catch (error) {
    next(error);
  }
});

router.get("/merchant/channels/jobs", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const result = await db.execute(sql`
      SELECT id, connection_id, direction, resource, status, attempts, last_error,
             metrics, next_attempt_at, started_at, completed_at, created_at, updated_at
      FROM merchant_channel_sync_jobs
      WHERE merchant_id = ${ctx.merchantId}
      ORDER BY created_at DESC
      LIMIT 200
    `);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      jobs: (result.rows as Array<Record<string, unknown>>).map(row => ({
        id: row.id,
        connectionId: row.connection_id,
        direction: row.direction,
        resource: row.resource,
        status: row.status,
        attempts: Number(row.attempts ?? 0),
        lastError: row.last_error ?? null,
        metrics: row.metrics ?? {},
        nextAttemptAt: row.next_attempt_at ?? null,
        startedAt: row.started_at ?? null,
        completedAt: row.completed_at ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/merchant/channels/:id/connect", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const id = txt(req.params.id, 80);
    if (!id || !safeUuid(id)) {
      res.status(400).json({ error: "Invalid channel connection id" });
      return;
    }
    if (!channelGatewayConfigured()) {
      res.status(503).json({ error: "The private self-hosted channel adapter gateway is not configured. No provider connection was attempted." });
      return;
    }

    const found = await db.execute(sql`
      SELECT c.*,
        (c.encrypted_access_token IS NOT NULL AND c.encrypted_access_token <> '') AS credential_configured,
        (c.encrypted_webhook_secret IS NOT NULL AND c.encrypted_webhook_secret <> '') AS webhook_configured
      FROM merchant_channel_connections c
      WHERE c.id = ${id}::uuid AND c.merchant_id = ${ctx.merchantId}
      LIMIT 1
    `);
    const connection = found.rows[0] as Record<string, unknown> | undefined;
    if (!connection) {
      res.status(404).json({ error: "Channel connection not found" });
      return;
    }
    if (connection.status === "revoked" || connection.status === "paused") {
      res.status(409).json({ error: "Paused or revoked channel connections cannot be connected" });
      return;
    }
    const storeUrl = typeof connection.store_url === "string" ? connection.store_url : null;
    if (connection.provider !== "custom" && (!storeUrl || !/^https:\/\//i.test(storeUrl))) {
      res.status(400).json({ error: "Add the channel's HTTPS store URL before connecting" });
      return;
    }

    let accessToken: string | null = null;
    let refreshToken: string | null = null;
    try {
      accessToken = typeof connection.encrypted_access_token === "string" ? decryptSecret(connection.encrypted_access_token) : null;
      refreshToken = typeof connection.encrypted_refresh_token === "string" ? decryptSecret(connection.encrypted_refresh_token) : null;
    } catch {
      res.status(409).json({ error: "Stored channel credentials could not be decrypted. Re-enter the credentials and reconnect." });
      return;
    }
    const test = await channelGatewayRequest<unknown>("connection.test", {
      connection: {
        id: String(connection.id),
        merchantId: ctx.merchantId,
        provider: String(connection.provider),
        displayName: String(connection.display_name),
        storeUrl,
        externalAccountRef: typeof connection.external_account_ref === "string" ? connection.external_account_ref : null,
        accessToken,
        refreshToken,
      },
    });
    if (!test || typeof test !== "object" || Array.isArray(test)) {
      res.status(502).json({ error: "Channel adapter returned an invalid connection test result" });
      return;
    }
    const tested = test as Record<string, unknown>;
    if (tested.ok !== true || tested.verified !== true) {
      res.status(502).json({ error: "The provider connection was not verified. Check the credentials and the private adapter's diagnostic logs.", connected: false });
      return;
    }
    const accountRef = typeof tested.providerAccountRef === "string" ? tested.providerAccountRef.trim().slice(0, 250) : null;
    const capabilities = Array.isArray(tested.capabilities)
      ? tested.capabilities.filter((value): value is string => typeof value === "string").slice(0, 30).map(value => value.slice(0, 80))
      : [];

    const connected = await db.transaction(async tx => {
      const updated = await tx.execute(sql`
        UPDATE merchant_channel_connections
        SET status = 'connected',
            external_account_ref = COALESCE(${accountRef}, external_account_ref),
            last_error = NULL,
            updated_at = now()
        WHERE id = ${id}::uuid
          AND merchant_id = ${ctx.merchantId}
          AND status NOT IN ('revoked','paused')
        RETURNING *
      `);
      const row = updated.rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      const resources: Array<{ resource: "products" | "inventory"; enabled: boolean }> = [
        { resource: "products", enabled: row.sync_products === true },
        { resource: "inventory", enabled: row.sync_inventory === true },
      ];
      for (const item of resources) {
        if (!item.enabled) continue;
        await tx.execute(sql`
          INSERT INTO merchant_channel_sync_jobs
            (connection_id,merchant_id,direction,resource,status,idempotency_key,requested_by,metrics)
          VALUES (${id}::uuid,${ctx.merchantId},'pull',${item.resource},'queued',
            ${"channel-bootstrap-" + item.resource + ":" + id},${ctx.userId},'{}'::jsonb)
          ON CONFLICT (connection_id,idempotency_key) DO UPDATE
          SET status='queued', attempts=0, locked_at=NULL, started_at=NULL, completed_at=NULL,
              next_attempt_at=NULL, last_error=NULL, updated_at=now()
          WHERE merchant_channel_sync_jobs.status IN ('failed','cancelled')
        `);
      }
      return row;
    });
    if (!connected) {
      res.status(409).json({ error: "Channel was paused or revoked during connection testing" });
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({
      connection: serialize({
        ...connected,
        credential_configured: Boolean(connection.encrypted_access_token),
        webhook_configured: Boolean(connection.encrypted_webhook_secret),
      }),
      verified: true,
      capabilities,
      bootstrapQueued: ["products", "inventory"].filter(resource =>
        resource === "products" ? connected.sync_products === true : connected.sync_inventory === true
      ),
    });
  } catch (error) {
    if (error instanceof ChannelGatewayError) {
      res.status(error.code === "invalid_gateway_response" ? 502 : 503).json({
        error: "The private channel adapter could not verify this connection. Check adapter availability and credentials; provider secrets were not returned.",
      });
      return;
    }
    next(error);
  }
});

router.post("/merchant/channels/:id/sync", async (req, res, next) => {
  try {
    const ctx = await merchantFor(req, res);
    if (!ctx) return;
    const connectionId = txt(req.params.id, 80);
    const direction = txt(req.body?.direction, 10);
    const resource = txt(req.body?.resource, 30);
    if (!connectionId || !safeUuid(connectionId) ||
        !DIRECTIONS.includes(direction as typeof DIRECTIONS[number]) ||
        !RESOURCES.includes(resource as typeof RESOURCES[number])) {
      res.status(400).json({ error: "Invalid sync request" });
      return;
    }
    const lookup = "SELECT id,status FROM merchant_channel_connections WHERE id=" + quote(connectionId) +
      " AND merchant_id=" + String(ctx.merchantId) + " LIMIT 1";
    const connection = (await db.execute(sql.raw(lookup))).rows[0] as Record<string, unknown> | undefined;
    if (!connection) {
      res.status(404).json({ error: "Channel connection not found" });
      return;
    }
    if (connection.status === "revoked") {
      res.status(409).json({ error: "Revoked channel connections cannot be synchronized" });
      return;
    }
    const idempotencyKey = txt(req.body?.idempotencyKey, 160) ||
      ["channel-sync",String(connection.id),direction,resource,new Date().toISOString().slice(0,16)].join(":");
    const scope = txt(req.body?.scope, 500);
    const correlationId = txt(req.body?.correlationId, 120);
    const jobQuery = [
      "INSERT INTO merchant_channel_sync_jobs",
      "(connection_id,merchant_id,direction,resource,scope,status,idempotency_key,requested_by,correlation_id,metrics)",
      "VALUES (" + quote(String(connection.id)) + "," + String(ctx.merchantId) + "," +
        quote(direction) + "," + quote(resource) + "," + quote(scope) + ",'queued'," +
        quote(idempotencyKey) + "," + quote(ctx.userId) + "," + quote(correlationId) + ",'{}'::jsonb)",
      "ON CONFLICT (connection_id,idempotency_key) DO UPDATE SET updated_at=now() RETURNING *",
    ].join(" ");
    const result = await db.execute(sql.raw(jobQuery));
    res.status(202).json({
      job: result.rows[0] ?? null,
      execution: "queued",
      note: "External I/O belongs to a provider adapter. Financial and authoritative inventory state remain inside Lunavo.",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
