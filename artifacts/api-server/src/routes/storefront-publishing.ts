import { createHash } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import { getAuth } from "../lib/auth-compat";
import { db, merchantStorefrontsTable, merchantStorefrontDomainsTable, merchantsTable, storefrontPublicationSnapshotsTable } from "@workspace/db";
import { requirePermission } from "../lib/tenant-access";
import { emitDomainEvent } from "../lib/domain-events";

const router = Router();
const MAX_THEME_BYTES = 64 * 1024;
const MAX_SECTIONS_BYTES = 512 * 1024;
const ALLOWED_SECTION_TYPES = new Set(["announcement","header","hero","featured_collection","product_grid","category_grid","image_with_text","video","testimonials","reviews","benefits","faq","newsletter","countdown","logo_cloud","rich_text","spacer","contact","footer","policies","custom_code","products","story"]);
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
  const merchant = (await db.select({ id: merchantsTable.id }).from(merchantsTable).where(and(eq(merchantsTable.status, "active"), or(eq(merchantsTable.clerkUserId, userId), eq(merchantsTable.localAuthUserId, userId)))).limit(1))[0];
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
  const result = await db.transaction(async (tx) => {
    // Serialize publication for this storefront. The draft and latest version are
    // re-read only after the lock so concurrent publishes cannot reuse a version.
    await tx.execute(sql`SELECT id FROM merchant_storefronts WHERE id = ${store.id} AND merchant_id = ${ctx.merchantId} FOR UPDATE`);
    const lockedStore = (await tx.select().from(merchantStorefrontsTable).where(and(eq(merchantStorefrontsTable.id, store.id), eq(merchantStorefrontsTable.merchantId, ctx.merchantId))).limit(1))[0];
    if (!lockedStore) throw new Error("Storefront not found");
    if (!validSections(lockedStore.sections) || jsonBytes(lockedStore.theme) > MAX_THEME_BYTES || jsonBytes(lockedStore.sections) > MAX_SECTIONS_BYTES) throw new Error("Draft contains invalid or oversized storefront content");

    const contentHash = createHash("sha256").update(canonicalPayload(lockedStore.theme, lockedStore.sections)).digest("hex");
    const latest = (await tx.select({
      version: storefrontPublicationSnapshotsTable.version,
      contentHash: storefrontPublicationSnapshotsTable.contentHash,
      publishedAt: storefrontPublicationSnapshotsTable.publishedAt,
    }).from(storefrontPublicationSnapshotsTable).where(and(
      eq(storefrontPublicationSnapshotsTable.storefrontId, lockedStore.id),
      eq(storefrontPublicationSnapshotsTable.merchantId, ctx.merchantId),
    )).orderBy(desc(storefrontPublicationSnapshotsTable.version)).limit(1))[0];

    if (latest?.contentHash === contentHash && lockedStore.published) {
      return { snapshot: latest, updated: lockedStore };
    }

    const version = (latest?.version ?? 0) + 1;
    const [snapshot] = await tx.insert(storefrontPublicationSnapshotsTable).values({
      storefrontId: lockedStore.id,
      merchantId: ctx.merchantId,
      version,
      theme: lockedStore.theme,
      sections: lockedStore.sections,
      contentHash,
      publishedByClerkUserId: ctx.userId,
    }).returning();

    const [updated] = await tx.update(merchantStorefrontsTable).set({ published: true, updatedAt: new Date() }).where(and(
      eq(merchantStorefrontsTable.id, lockedStore.id),
      eq(merchantStorefrontsTable.merchantId, ctx.merchantId),
    )).returning();

    await emitDomainEvent(tx, {
      merchantId: ctx.merchantId,
      eventType: "storefront.published",
      aggregateType: "storefront",
      aggregateId: lockedStore.id,
      actorType: "merchant",
      actorId: ctx.userId,
      source: "merchant_api",
      idempotencyKey: `storefront:${lockedStore.id}:published:${version}`,
      payload: { version, contentHash },
    });
    return { snapshot, updated };
  });
  const contentHash = result.snapshot.contentHash;
  const version = result.snapshot.version;
  res.json({ published: true, version, contentHash, publishedAt: result.snapshot.publishedAt, storefront: result.updated });
});
router.post("/storefront-builder/:id/unpublish", async (req, res): Promise<void> => {
  const ctx = await merchantContext(req, res); if (!ctx) return;
  const store = await ownedStore(req.params.id, ctx.merchantId); if (!store) { res.status(404).json({ error: "Storefront not found" }); return; }
  const [updated] = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM merchant_storefronts WHERE id = ${store.id} AND merchant_id = ${ctx.merchantId} FOR UPDATE`);
    return tx.update(merchantStorefrontsTable).set({ published: false, updatedAt: new Date() }).where(and(
      eq(merchantStorefrontsTable.id, store.id),
      eq(merchantStorefrontsTable.merchantId, ctx.merchantId),
    )).returning();
  });
  res.json({ published: updated.published, id: updated.id });
});
router.get("/public/storefront/by-host", async (req, res): Promise<void> => {
  const hostname = typeof req.query.hostname === "string" ? req.query.hostname.trim().toLowerCase() : "";
  if (!hostname || hostname.length > 253 || hostname.includes("/") || hostname.includes("@")) { res.status(400).json({ error: "Invalid hostname" }); return; }
  const domain = (await db.select({ storefrontId: merchantStorefrontDomainsTable.storefrontId, merchantId: merchantStorefrontDomainsTable.merchantId }).from(merchantStorefrontDomainsTable).where(and(eq(merchantStorefrontDomainsTable.hostname, hostname), eq(merchantStorefrontDomainsTable.status, "verified"))).limit(1))[0];
  if (!domain?.storefrontId) { res.status(404).json({ error: "Storefront not found" }); return; }
  const store = (await db.select({ id: merchantStorefrontsTable.id, name: merchantStorefrontsTable.name, slug: merchantStorefrontsTable.slug, publicKey: merchantStorefrontsTable.publicKey, published: merchantStorefrontsTable.published }).from(merchantStorefrontsTable).where(and(eq(merchantStorefrontsTable.id, domain.storefrontId), eq(merchantStorefrontsTable.merchantId, domain.merchantId), eq(merchantStorefrontsTable.published, true))).limit(1))[0];
  if (!store) { res.status(404).json({ error: "Storefront not published" }); return; }
  const snapshot = (await db.select({ version: storefrontPublicationSnapshotsTable.version, theme: storefrontPublicationSnapshotsTable.theme, sections: storefrontPublicationSnapshotsTable.sections, contentHash: storefrontPublicationSnapshotsTable.contentHash, publishedAt: storefrontPublicationSnapshotsTable.publishedAt }).from(storefrontPublicationSnapshotsTable).where(and(eq(storefrontPublicationSnapshotsTable.storefrontId, store.id), eq(storefrontPublicationSnapshotsTable.merchantId, domain.merchantId))).orderBy(desc(storefrontPublicationSnapshotsTable.version)).limit(1))[0];
  if (!snapshot) { res.status(404).json({ error: "Published storefront version not found" }); return; }
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  res.json({ ...store, theme: snapshot.theme, sections: snapshot.sections, version: snapshot.version, contentHash: snapshot.contentHash, publishedAt: snapshot.publishedAt });
});
export default router;
