import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { and, desc, eq } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, merchantStorefrontDomainsTable, merchantStorefrontsTable, merchantsTable } from "@workspace/db";
import { requirePermission } from "../lib/tenant-access";

const router = Router();
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function normalizeHostname(value: unknown) {
  if (typeof value !== "string") return null;
  const hostname = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return HOST_RE.test(hostname) ? hostname : null;
}

async function merchantFor(req: Request, res: Response) {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  const merchant = (await db.select({ id: merchantsTable.id }).from(merchantsTable)
    .where(eq(merchantsTable.clerkUserId, userId)).limit(1))[0];
  if (!merchant) { res.status(404).json({ error: "Merchant workspace not found" }); return null; }
  try { await requirePermission(userId, merchant.id, "team.manage"); } catch { res.status(403).json({ error: "Store domain management permission required" }); return null; }
  return { userId, merchantId: merchant.id };
}

function verificationName(hostname: string) { return `_lunavo-verify.${hostname}`; }
function verificationInstructions(hostname: string, token: string) {
  return { type: "TXT", name: verificationName(hostname), value: token };
}

router.get("/domains", async (req, res): Promise<void> => {
  const ctx = await merchantFor(req, res); if (!ctx) return;
  const rows = await db.select({
    id: merchantStorefrontDomainsTable.id,
    storefrontId: merchantStorefrontDomainsTable.storefrontId,
    hostname: merchantStorefrontDomainsTable.hostname,
    domainType: merchantStorefrontDomainsTable.domainType,
    status: merchantStorefrontDomainsTable.status,
    isPrimary: merchantStorefrontDomainsTable.isPrimary,
    verifiedAt: merchantStorefrontDomainsTable.verifiedAt,
    createdAt: merchantStorefrontDomainsTable.createdAt,
  }).from(merchantStorefrontDomainsTable)
    .where(eq(merchantStorefrontDomainsTable.merchantId, ctx.merchantId))
    .orderBy(desc(merchantStorefrontDomainsTable.createdAt));
  res.json(rows);
});

router.post("/domains", async (req, res): Promise<void> => {
  const ctx = await merchantFor(req, res); if (!ctx) return;
  const hostname = normalizeHostname(req.body?.hostname);
  if (!hostname) { res.status(400).json({ error: "Enter a valid domain or hostname" }); return; }
  const storefrontId = typeof req.body?.storefrontId === "string" ? req.body.storefrontId : null;
  if (storefrontId) {
    const store = (await db.select({ id: merchantStorefrontsTable.id }).from(merchantStorefrontsTable)
      .where(and(eq(merchantStorefrontsTable.id, storefrontId), eq(merchantStorefrontsTable.merchantId, ctx.merchantId))).limit(1))[0];
    if (!store) { res.status(404).json({ error: "Storefront not found" }); return; }
  }
  const existing = (await db.select({ id: merchantStorefrontDomainsTable.id }).from(merchantStorefrontDomainsTable)
    .where(eq(merchantStorefrontDomainsTable.hostname, hostname)).limit(1))[0];
  if (existing) { res.status(409).json({ error: "That hostname is already registered" }); return; }
  const token = `lunavo-${randomBytes(24).toString("hex")}`;
  const [row] = await db.insert(merchantStorefrontDomainsTable).values({
    merchantId: ctx.merchantId, storefrontId, hostname, domainType: "custom",
    verificationToken: token, verificationMethod: "dns_txt", status: "pending", isPrimary: false,
  }).returning();
  res.status(201).json({
    id: row.id, hostname: row.hostname, storefrontId: row.storefrontId, status: row.status,
    instructions: verificationInstructions(hostname, token),
    routingTarget: process.env.LUNAVO_DOMAIN_TARGET ?? null,
    routingConfigured: Boolean(process.env.LUNAVO_DOMAIN_TARGET),
  });
});

router.post("/domains/:id/verify", async (req, res): Promise<void> => {
  const ctx = await merchantFor(req, res); if (!ctx) return;
  const row = (await db.select().from(merchantStorefrontDomainsTable).where(and(
    eq(merchantStorefrontDomainsTable.id, req.params.id),
    eq(merchantStorefrontDomainsTable.merchantId, ctx.merchantId),
  )).limit(1))[0];
  if (!row) { res.status(404).json({ error: "Domain not found" }); return; }
  if (row.status === "verified") { res.json({ verified: true, status: row.status }); return; }
  try {
    const records = await resolveTxt(verificationName(row.hostname));
    const verified = records.flat().some((value) => value.trim() === row.verificationToken);
    if (!verified) { res.status(409).json({ verified: false, status: "pending", error: "Verification TXT record was not found yet" }); return; }
    const [updated] = await db.update(merchantStorefrontDomainsTable).set({ status: "verified", verifiedAt: new Date() })
      .where(and(eq(merchantStorefrontDomainsTable.id, row.id), eq(merchantStorefrontDomainsTable.merchantId, ctx.merchantId))).returning();
    res.json({ verified: true, status: updated.status, verifiedAt: updated.verifiedAt });
  } catch {
    res.status(409).json({ verified: false, status: "pending", error: "DNS TXT record could not be resolved yet" });
  }
});

router.post("/domains/:id/primary", async (req, res): Promise<void> => {
  const ctx = await merchantFor(req, res); if (!ctx) return;
  const row = (await db.select().from(merchantStorefrontDomainsTable).where(and(
    eq(merchantStorefrontDomainsTable.id, req.params.id), eq(merchantStorefrontDomainsTable.merchantId, ctx.merchantId),
  )).limit(1))[0];
  if (!row) { res.status(404).json({ error: "Domain not found" }); return; }
  if (row.status !== "verified") { res.status(409).json({ error: "Only verified domains can become primary" }); return; }
  await db.transaction(async (tx) => {
    if (row.storefrontId) await tx.update(merchantStorefrontDomainsTable).set({ isPrimary: false }).where(eq(merchantStorefrontDomainsTable.storefrontId, row.storefrontId));
    await tx.update(merchantStorefrontDomainsTable).set({ isPrimary: true }).where(eq(merchantStorefrontDomainsTable.id, row.id));
  });
  res.json({ id: row.id, primary: true });
});

router.delete("/domains/:id", async (req, res): Promise<void> => {
  const ctx = await merchantFor(req, res); if (!ctx) return;
  const [deleted] = await db.update(merchantStorefrontDomainsTable).set({ status: "disabled", isPrimary: false })
    .where(and(eq(merchantStorefrontDomainsTable.id, req.params.id), eq(merchantStorefrontDomainsTable.merchantId, ctx.merchantId))).returning({ id: merchantStorefrontDomainsTable.id });
  if (!deleted) { res.status(404).json({ error: "Domain not found" }); return; }
  res.status(204).end();
});

export default router;
