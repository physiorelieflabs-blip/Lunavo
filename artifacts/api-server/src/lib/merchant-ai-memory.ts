import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

function quote(value: string): string {
  if (value.includes(String.fromCharCode(0))) throw new Error("Invalid null byte");
  return "'" + value.replaceAll("'", "''") + "'";
}

export type MerchantMemory = {
  memoryType: "preference" | "fact" | "decision" | "lesson" | "constraint" | "experiment" | "strategy";
  memoryKey: string;
  content: string;
  confidenceBps: number;
  source: string;
  model?: string | null;
  evidence?: Record<string, unknown>;
  expiresAt?: Date | null;
};

export async function rememberMerchantMemory(
  merchantId: number,
  input: MerchantMemory,
): Promise<void> {
  if (!Number.isInteger(merchantId) || merchantId <= 0) throw new Error("Invalid merchant id");
  if (!input.memoryKey.trim() || input.memoryKey.length > 160) throw new Error("Invalid memory key");
  if (!input.content.trim() || input.content.length > 12_000) throw new Error("Invalid memory content");
  if (!Number.isInteger(input.confidenceBps) || input.confidenceBps < 0 || input.confidenceBps > 10_000) {
    throw new Error("Invalid memory confidence");
  }

  const query = [
    "INSERT INTO merchant_ai_memory",
    "(merchant_id,memory_type,memory_key,content,confidence_bps,source,model,evidence,expires_at,updated_at)",
    "VALUES (",
    String(merchantId) + "," + quote(input.memoryType) + "," + quote(input.memoryKey) + "," +
      quote(input.content) + "," + String(input.confidenceBps) + "," + quote(input.source) + "," +
      quote(input.model ?? "") + "," + quote(JSON.stringify(input.evidence ?? {})) + "::jsonb," +
      (input.expiresAt ? quote(input.expiresAt.toISOString()) : "NULL") + ",now())",
    "ON CONFLICT (merchant_id,memory_type,memory_key) DO UPDATE SET",
    "content=EXCLUDED.content,confidence_bps=EXCLUDED.confidence_bps,source=EXCLUDED.source,model=EXCLUDED.model,evidence=EXCLUDED.evidence,expires_at=EXCLUDED.expires_at,updated_at=now()",
  ].join(" ");
  await db.execute(sql.raw(query));
}

export async function recallMerchantMemory(
  merchantId: number,
  limit = 24,
): Promise<Array<Record<string, unknown>>> {
  if (!Number.isInteger(merchantId) || merchantId <= 0) throw new Error("Invalid merchant id");
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const query = [
    "SELECT memory_type,memory_key,content,confidence_bps,source,model,evidence,expires_at,updated_at",
    "FROM merchant_ai_memory",
    "WHERE merchant_id=" + String(merchantId),
    "AND (expires_at IS NULL OR expires_at > now())",
    "ORDER BY confidence_bps DESC,updated_at DESC",
    "LIMIT " + String(boundedLimit),
  ].join(" ");
  const result = await db.execute(sql.raw(query));
  await db.execute(sql.raw(
    "UPDATE merchant_ai_memory SET last_used_at=now() WHERE merchant_id=" + String(merchantId) +
    " AND (expires_at IS NULL OR expires_at > now())"
  ));
  return result.rows as Array<Record<string, unknown>>;
}
