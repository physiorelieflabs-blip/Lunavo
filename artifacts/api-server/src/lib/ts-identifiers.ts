import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";

export type SqlExecutor = { execute: (query: unknown) => Promise<any> };

function token(prefix: string): string {
  return `${prefix}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

async function ensureCode(executor: SqlExecutor, query: (code: string) => ReturnType<typeof sql>, prefix: string, selectQuery: ReturnType<typeof sql>): Promise<string> {
  const existing = await executor.execute(selectQuery);
  const existingCode = String(existing.rows?.[0]?.code ?? "").trim();
  if (existingCode) return existingCode;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = token(prefix);
    try {
      const inserted = await executor.execute(query(code));
      const insertedCode = String(inserted.rows?.[0]?.code ?? code).trim();
      if (insertedCode) return insertedCode;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/unique|duplicate/i.test(message)) throw error;
    }
  }
  throw new Error(`Could not allocate a unique ${prefix} identifier`);
}

export async function ensureMerchantAdminPaymentCode(executor: SqlExecutor, merchantId: number): Promise<string> {
  return ensureCode(
    executor,
    (code) => sql`INSERT INTO ts_merchant_admin_codes (merchant_id, code) VALUES (${merchantId}, ${code}) ON CONFLICT (merchant_id) DO NOTHING RETURNING code`,
    "TS-MA",
    sql`SELECT code FROM ts_merchant_admin_codes WHERE merchant_id = ${merchantId} LIMIT 1`,
  );
}

export async function ensureStoreCode(executor: SqlExecutor, storefrontId: string): Promise<string> {
  return ensureCode(
    executor,
    (code) => sql`INSERT INTO ts_store_codes (storefront_id, code) VALUES (${storefrontId}, ${code}) ON CONFLICT (storefront_id) DO NOTHING RETURNING code`,
    "TS-STORE",
    sql`SELECT code FROM ts_store_codes WHERE storefront_id = ${storefrontId} LIMIT 1`,
  );
}

export async function ensureCustomerPaymentCode(executor: SqlExecutor, customerId: number): Promise<string> {
  return ensureCode(
    executor,
    (code) => sql`INSERT INTO ts_customer_codes (customer_id, code) VALUES (${customerId}, ${code}) ON CONFLICT (customer_id) DO NOTHING RETURNING code`,
    "TS-CUST",
    sql`SELECT code FROM ts_customer_codes WHERE customer_id = ${customerId} LIMIT 1`,
  );
}

export async function ensureGlobalAdminCode(executor: SqlExecutor): Promise<string> {
  return ensureCode(
    executor,
    (code) => sql`INSERT INTO ts_platform_codes (scope, code) VALUES ('global', ${code}) ON CONFLICT (scope) DO NOTHING RETURNING code`,
    "TS-ADMIN",
    sql`SELECT code FROM ts_platform_codes WHERE scope = 'global' LIMIT 1`,
  );
}
