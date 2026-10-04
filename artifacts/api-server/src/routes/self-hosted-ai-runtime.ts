import { Router, type Request, type Response } from "express";
import { and, eq, or } from "drizzle-orm";
import { db, merchantsTable } from "@workspace/db";
import { getAuth } from "../lib/auth-compat";
import { requirePermission } from "../lib/tenant-access";
import { configuredSelfHostedProfiles, selfHostedAiConfigured } from "../lib/self-hosted-ai";
import { embeddingsConfigured } from "../lib/self-hosted-embeddings";
import { SELF_HOSTED_RUNTIME } from "../lib/self-hosted-runtime";

const router = Router();

async function merchantFor(req: Request, res: Response) {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  const [merchant] = await db.select({ id: merchantsTable.id })
    .from(merchantsTable)
    .where(and(
      eq(merchantsTable.status, "active"),
      or(eq(merchantsTable.localAuthUserId, userId), eq(merchantsTable.clerkUserId, userId)),
    ))
    .limit(1);
  if (!merchant) { res.status(404).json({ error: "Merchant workspace not found" }); return null; }
  try { await requirePermission(userId, merchant.id, "team.manage"); }
  catch { res.status(403).json({ error: "Permission required" }); return null; }
  return merchant;
}

router.get("/merchant/ai/runtime", async (req, res) => {
  if (!await merchantFor(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  res.json({
    selfHosted: true,
    configured: selfHostedAiConfigured(),
    embeddingsConfigured: embeddingsConfigured(),
    profiles: configuredSelfHostedProfiles(),
    ensemble: SELF_HOSTED_RUNTIME.intelligence.ensemble,
    policy: {
      externalAiKeysRequired: SELF_HOSTED_RUNTIME.policy.externalAiKeysRequired,
      modelMayMoveMoney: SELF_HOSTED_RUNTIME.policy.modelMayMoveMoney,
      modelMayConfirmPayment: SELF_HOSTED_RUNTIME.policy.modelMayConfirmPayment,
      modelMayChangeLedger: SELF_HOSTED_RUNTIME.policy.modelMayChangeLedger,
      modelMayChangeInventory: SELF_HOSTED_RUNTIME.policy.modelMayChangeInventory,
      modelMayBypassApproval: SELF_HOSTED_RUNTIME.policy.modelMayBypassApproval,
    },
    paymentException: SELF_HOSTED_RUNTIME.policy.externalPaymentRail,
  });
});

export default router;
