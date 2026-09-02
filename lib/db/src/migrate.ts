import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run database migrations");
}

const migrations = [
  "0001_production_hardening",
  "0002_internal_commerce",
  "0003_withdrawals_and_supplier_imports",
  "0004_linked_bank_accounts",
  "0005_auto_dropshipping",
  "0006_checkout_quantity",
  "0007_supplier_import_workflows",
  "0008_merchant_currency",
  "0009_ai_operating_layer",
  "0010_authoritative_accounting",
  "0011_inventory_reservations_movements",
  "0012_withdrawal_pins",
];
const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  await client.query(
    "SELECT pg_advisory_lock(hashtext('ts-commerce-schema-migrations'))",
  );
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_ts_commerce_migrations" (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const migrationId of migrations) {
    const migrationPath = new URL(
      `../migrations/${migrationId}.sql`,
      import.meta.url,
    );
    const migrationSql = await readFile(migrationPath, "utf8");
    const applied = await client.query<{ id: string }>(
      'SELECT id FROM "_ts_commerce_migrations" WHERE id = $1',
      [migrationId],
    );
    if (applied.rowCount) {
      console.log(`Database migration ${migrationId} already applied`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(migrationSql);
      await client.query(
        'INSERT INTO "_ts_commerce_migrations" (id) VALUES ($1)',
        [migrationId],
      );
      await client.query("COMMIT");
      console.log(`Applied database migration ${migrationId}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.query(
    "SELECT pg_advisory_unlock(hashtext('ts-commerce-schema-migrations'))",
  );
  client.release();
  await pool.end();
}