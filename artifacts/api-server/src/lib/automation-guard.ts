import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export async function reserveAutomationAction(db: NodePgDatabase<any>, merchantId: number, kind: "action" | "ad") {
  if (!Number.isInteger(merchantId) || merchantId <= 0) throw new Error("Invalid merchant");
  return db.transaction(async (tx) => {
    const policyResult = await tx.execute(sql`SELECT enabled, daily_action_limit, daily_ad_limit FROM merchant_automation_policies WHERE merchant_id = ${merchantId} FOR UPDATE`);
    const policy = policyResult.rows[0] as { enabled?: boolean; daily_action_limit?: number; daily_ad_limit?: number } | undefined;
    const enabled = policy?.enabled ?? true;
    if (!enabled) throw new Error("Merchant automation is disabled");
    const actionLimit = Number(policy?.daily_action_limit ?? 500);
    const adLimit = Number(policy?.daily_ad_limit ?? 3);
    const column = kind === "ad" ? sql`ads_published` : sql`actions`;
    const limit = kind === "ad" ? adLimit : actionLimit;
    const usage = await tx.execute(sql`SELECT actions, ads_published FROM merchant_automation_daily_usage WHERE merchant_id = ${merchantId} AND usage_date = CURRENT_DATE FOR UPDATE`);
    const row = usage.rows[0] as { actions?: number; ads_published?: number } | undefined;
    const used = Number(kind === "ad" ? row?.ads_published ?? 0 : row?.actions ?? 0);
    if (used >= limit) throw new Error(`Daily ${kind} automation limit reached`);
    await tx.execute(sql`INSERT INTO merchant_automation_daily_usage (merchant_id, usage_date, actions, ads_published) VALUES (${merchantId}, CURRENT_DATE, ${kind === "action" ? 1 : 0}, ${kind === "ad" ? 1 : 0}) ON CONFLICT (merchant_id, usage_date) DO UPDATE SET actions = merchant_automation_daily_usage.actions + ${kind === "action" ? 1 : 0}, ads_published = merchant_automation_daily_usage.ads_published + ${kind === "ad" ? 1 : 0}`);
    return { remaining: Math.max(0, limit - used - 1), limit };
  });
}
