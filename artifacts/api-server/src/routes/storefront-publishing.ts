import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, merchantStorefrontsTable, merchantStorefrontDomainsTable, merchantsTable, storefrontPublicationSnapshotsTable } from "@workspace/db";
import { requirePermission } from "../lib/tenant-access";
import { emitDomainEvent } from "../lib/domain-events";

const router = Router();
const MAX_THEME_BYTES = 64 * 1024;
const MAX_SECTIONS_BYTES = 512 * 1024;
const ALLOWED_SECTION_TYPES = new Set(["hero", "products", "categories", "text", "image", "gallery", "features", "testimonials", "faq", "newsletter", "cta", "announcement", "video", "spacer", "story"]);
function jsonBytes(value: unknown) { return Buffer.byteLength(JSON.stringify(value ?? null), "utf8"); }
function validSections(value: unknown): value is Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length > 100) return false;
  const ids = new Set<string>();
  return value.every((section) => {
    if (!section || typeof section !== "object" || Array.isArray(section)) return false;
    if (typeof section.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(section.id) || ids.has(section.id)) return false;
    if (typeof section.type !== "string" || !ALLOWED_SECTION_TYPES.has(section.type)) return false;
    ids.add(section.id); return true;
  });
}
function canonicalPayload(theme: unknown, sections: unknown) { return JSON.stringify({ theme, sections }); }
async function merchantContext(req: Request, res: Response) {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  const merchant = (await db.select({ id: merchantsTable.id }).from(merchantsTable).where(eq(merchantsTable.clerkUserId, userId)).limit(1))[0];
  if (!merchant) { res.status(404).json({ error: "Merchant workspace not found" }); return null; }
  try { await requirePermission(userId, merchant.id, "team.manage"); } catch { res.status(403).json({ error: "Store builder permission required" }); return null; }
  return { userId, merchantId: merchant.id };
}
async function ownedStore(storefrontId: string, merchantId: number) {
  return (await db.select().from(merchantStorefrontsTable).where(and(eq(merchantStorefrontsTable.id, storefrontId), eq(merchantStorefrontsTable.merchantId, merchantId))).limit(1))[0] ?? null;
}
router.get("/storefront-builder/:id/draft", async (req, res): Promise<void> => {
  const ctx = await merchantContext(req, res); if (!ctx) return;
  const store = await ownedStore(req.params.id, ctx.merchantId); if (!store) { res.status(404).json({ error: "Storefront not found" }); return; }
  res.json({ id: store.id, name: store.name, slug: store.slug, theme: store.theme, sections: store.sections, published: store.published, updatedAt: store.updatedAt });
});
router.put("/storefront-builder/:id/draft", async (req, res): Promise<void> => {
  const ctx = await merchantContext(req, res); if (!ctx) return;
  const store = await ownedStore(req.params.id, ctx.merchantId); if (!store) { res.status(404).json({ error: "Storefront not found" }); return; }
  const theme = req.body?.theme; const sections = req.body?.sections;
  if (theme === undefined || !validSections(sections)) { res.status(400).json({ error: "Invalid storefront theme or sections" }); return; }
  if (jsonBytes(theme) > MAX_THEME_BYTES || jsonBytes(sections) > MAX_SECTIONS_BYTES) { res.status(413).json({ error: "Storefront content is too large" }); return; }
  const [updated] = await db.update(merchantStorefrontsTable).set({ theme, sections, updatedAt: new Date() }).where(and(eq(merchantStorefrontsTable.id, store.id), eq(merchantStorefrontsTable.merchantId, ctx.merchantId))).returning();
  res.json({ id: updated.id, theme: updated.theme, sections: updated.sections, published: updated.published, updatedAt: updated.updatedAt });
});
router.post("/storefront-builder/:id/publish", async (req, res): Promise<void> => {
  const ctx = await merchantContext(req, res); if (!ctx) return;
  const store = await ownedStore(req.params.id, ctx.merchantId); if (!store) { res.status(404).json({ error: "Storefront not found" }); return; }
  if (!validSections(store.sections) || jsonBytes(store.theme) > MAX_THEME_BYTES || jsonBytes(store.sections) > MAX_SECTIONS_BYTES) { res.status(409).json({ error: "Draft contains invalid or oversized storefront content" }); return; }
  const latest = (await db.select({ version: storefrontPublicationSnapshotsTable.version, contentHash: storefrontPublicationSnapshotsTable.contentHash, publishedAt: storefrontPublicationSnapshotsTable.publishedAt }).from(storefrontPublicationSnapshotsTable).where(and(eq(storefrontPublicationSnapshotsTable.storefrontId, store.id), eq(storefrontPublicationSnapshotsTable.merchantId, ctx.merchantId))).orderBy(desc(storefrontPublicationSnapshotsTable.version)).limit(1))[0];
  const contentHash = createHash("sha256").update(canonicalPayload(store.theme, store.sections)).digest("hex");
  if (latest?.contentHash === contentHash && store.published) { res.json({ published: true, version: latest.version, contentHash, publishedAt: latest.publishedAt, storefront: store }); return; }
  const version = (latest?.version ?? 0) + 1;
  const result = await db.transaction(async (tx) => {
    const [snapshot] = await tx.insert(storefrontPublicationSnapshotsTable).values({ storefrontId: store.id, merchantId: ctx.merchantId, version, theme: store.theme, sections: store.sections, contentHash, publishedByClerkUserId: ctx.userId }).returning();
    const [updated] = await tx.update(merchantStorefrontsTable).set({ published: true, updatedAt: new Date() }).where(and(eq(merchantStorefrontsTable.id, store.id), eq(merchantStorefrontsTable.merchantId, ctx.merchantId))).returning();
    await emitDomainEvent(tx, { merchantId: ctx.merchantId, eventType: "storefront.published", aggregateType: "storefront", aggregateId: store.id, actorType: "merchant", actorId: ctx.userId, source: "merchant_api", idempotencyKey: `storefront:${store.id}:published:${version}`, payload: { version, contentHash } });
    return { snapshot, updated };
  });
  res.json({ published: true, version, contentHash, publishedAt: result.snapshot.publishedAt, storefront: result.updated });
});
router.post("/storefront-builder/:id/unpublish", async (req, res): Promise<void> => {
  const ctx = await merchantContext(req, res); if (!ctx) return;
  const store = await ownedStore(req.params.id, ctx.merchantId); if (!store) { res.status(404).json({ error: "Storefront not found" }); return; }
  const [updated] = await db.update(merchantStorefrontsTable).set({ published: false, updatedAt: new Date() }).where(and(eq(merchantStorefrontsTable.id, store.id), eq(merchantStorefrontsTable.merchantId, ctx.merchantId))).returning();
  res.json({ published: updated.published, id: updated.id });
});
router.get("/public/storefront/by-host", async (req, res): Promise<void> => {
  const hostname = typeof req.query.hostname === "string" ? req.query.hostname.trim().toLowerCase() : "";
  if (!hostname || hostname.length > 253 || hostname.includes("/") || hostname.includes("@")) { res.status(400).json({ error: "Invalid hostname" }); return; }
  const domain = (await db.select({ storefrontId: merchantStorefrontDomainsTable.storefrontId }).from(merchantStorefrontDomainsTable).where(and(eq(merchantStorefrontDomainsTable.hostname, hostname), eq(merchantStorefrontDomainsTable.status, "verified"))).limit(1))[0];
  if (!domain?.storefrontId) { res.status(404).json({ error: "Storefront not found" }); return; }
  const store = (await db.select({ id: merchantStorefrontsTable.id, name: merchantStorefrontsTable.name, slug: merchantStorefrontsTable.slug, publicKey: merchantStorefrontsTable.publicKey, published: merchantStorefrontsTable.published }).from(merchantStorefrontsTable).where(and(eq(merchantStorefrontsTable.id, domain.storefrontId), eq(merchantStorefrontsTable.published, true))).limit(1))[0];
  if (!store) { res.status(404).json({ error: "Storefront not published" }); return; }
  const snapshot = (await db.select({ version: storefrontPublicationSnapshotsTable.version, theme: storefrontPublicationSnapshotsTable.theme, sections: storefrontPublicationSnapshotsTable.sections, contentHash: storefrontPublicationSnapshotsTable.contentHash, publishedAt: storefrontPublicationSnapshotsTable.publishedAt }).from(storefrontPublicationSnapshotsTable).where(and(eq(storefrontPublicationSnapshotsTable.storefrontId, store.id), eq(storefrontPublicationSnapshotsTable.merchantId, (await db.select({ id: merchantsTable.id }).from(merchantsTable).where(eq(merchantsTable.id, (await db.select({ merchantId: merchantStorefrontsTable.merchantId }).from(merchantStorefrontsTable).where(eq(merchantStorefrontsTable.id, store.id)).limit(1))[0]?.merchantId ?? -1)).limit(1))[0]?.id ?? -1))).orderBy(desc(storefrontPublicationSnapshotsTable.version)).limit(1))[0];
  if (!snapshot) { res.status(404).json({ error: "Published storefront version not found" }); return; }
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  res.json({ ...store, theme: snapshot.theme, sections: snapshot.sections, version: snapshot.version, contentHash: snapshot.contentHash, publishedAt: snapshot.publishedAt });
});
export default router;
