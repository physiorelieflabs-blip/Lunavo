import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import pg from "pg";
const { Pool } = pg;


async function bootstrapPublicSchemaIfNeeded(client: import("pg").PoolClient): Promise<boolean> {
  const result = await client.query<{ public_schema: string | null; legacy_schema: string | null }>(
    "SELECT to_regclass('public.merchants')::text AS public_schema, to_regclass('lunavo.merchants')::text AS legacy_schema",
  );
  if (result.rows[0]?.public_schema) return false;
  if (result.rows[0]?.legacy_schema) return false;

  const drizzleKitBin = fileURLToPath(new URL("../node_modules/drizzle-kit/bin.cjs", import.meta.url));
  const configPath = fileURLToPath(new URL("../drizzle.config.ts", import.meta.url));

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [drizzleKitBin, "push", "--force", "--config", configPath], {
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Initial PostgreSQL schema bootstrap failed with exit code ${code ?? "unknown"}`));
    });
  });

  const verified = await client.query<{ schema_name: string | null }>(
    "SELECT to_regclass('public.merchants')::text AS schema_name",
  );
  if (!verified.rows[0]?.schema_name) {
    throw new Error("Initial PostgreSQL schema bootstrap completed without creating the public commerce schema");
  }
  return true;
}

const BOOTSTRAP_RUNTIME_MIGRATIONS = ["0084_local_auth","0085_local_auth_recovery","0086_public_audit_log","0087_master_admin_mfa","0088_fulfillment_tracking","0089_local_auth_session_metadata","0090_platform_integrations_runtime","0091_social_publish_job_processing","0092_social_publish_options","0093_runtime_security_repair","0094_ts_pay_transfer_idempotency","0095_growth_product_reference_uuid","0096_local_auth_lockout","0097_merchant_kyc","0098_local_auth_email_verification","0099_verified_purchase_discovery_attribution","0100_payment_reconciliation_exceptions","0101_ledger_immutable_guard"] as const;

export async function runMigrations() {
  const databaseUrl=process.env.DATABASE_URL;if(!databaseUrl)throw new Error("DATABASE_URL is required to run database migrations");
  const migrations=["0001_production_hardening","0002_internal_commerce","0003_withdrawals_and_supplier_imports","0004_linked_bank_accounts","0005_auto_dropshipping","0006_checkout_quantity","0007_supplier_import_workflows","0008_merchant_currency","0009_ai_operating_layer","0010_authoritative_accounting","0011_inventory_reservations_movements","0012_withdrawal_pins","0013_supplier_payments","0014_checkout_pricing","0015_customer_notes","0016_customer_segments","0016_commerce_growth_sourcing_marketplace","0017_subscription_currency","0018_ai_goals","0019_payment_links","0020_marketplace_management","0021_invoices","0022_invoice_accounting","0023_domain_event_outbox","0024_staff_roles_locations","0025_operational_location_ownership","0026_customer_management_permission","0027_store_profile_details","0028_advertising_payments","0029_auctions","0030_subscription_billing_timezone","0031_whop_payment_reference","0032_public_checkout_payments","0033_provider_refund_tracking","0034_whop_webhook_events","0035_ts_pay_internal_bank","0036_ts_pay_payout_accounting","0037_flutterwave_webhook_events","0038_storefront_builder","0039_media_assets","0040_transfer_entry_types_and_payment_link_orders","0041_payment_intent_checkout_urls","0042_referrals_and_payment_destinations","0043_subscription_payment_choice_window","0044_referral_reward_integrity","0045_payment_settlement_snapshots","0046_payment_destination_attempts","0047_referral_free_month_milestone","0048_critical_payment_referral_hardening","0049_subscription_access_window_hardening","0050_referral_discount_rate","0051_storefront_entities_and_media_links","0052_marketplace_ad_payment_link","0053_commerce_suite_autods","0054_self_hosted_ad_studio","0055_social_hub","0056_social_publishing_and_custom_ad_media","0057_platform_integrations","0058_storefront_domains","0059_storefront_publication_snapshots","0060_auction_integrity","0061_lunavo_merchant_control_plane","0062_automation_usage_and_audit","0063_store_auction_lifecycle","0064_daily_ai_advertising","0065_store_auction_payment_verifications","0066_product_auction_lifecycle","0067_product_auction_settlement","0068_auctioneer_ai_and_dashboard_transactions","0069_ledger_dashboard_projection","0070_ts_pay_transaction_boundary","0071_ts_pay_internal_transfer_ledger","0072_admin_ai_store_jobs","0073_store_ownership_access_security","0074_ts_pay_transfer_integrity","0075_store_access_revocation_history","0076_ts_pay_dashboard_transfer_projection","0077_store_ownership_revocation_trigger_fix","0078_store_auction_metric_integrity","0079_ai_store_creation_idempotency","0080_store_scoped_ai_advertising","0081_ai_store_build_artifacts","0082_ai_advertising_scale","0083_flutterwave_webhook_secret","0084_local_auth","0085_local_auth_recovery","0086_public_audit_log","0087_master_admin_mfa","0088_fulfillment_tracking", "0089_local_auth_session_metadata","0090_platform_integrations_runtime","0091_social_publish_job_processing","0092_social_publish_options","0093_runtime_security_repair","0094_ts_pay_transfer_idempotency","0095_growth_product_reference_uuid","0096_local_auth_lockout","0097_merchant_kyc","0098_local_auth_email_verification","0099_verified_purchase_discovery_attribution","0100_payment_reconciliation_exceptions","0101_ledger_immutable_guard"];
  const pool=new Pool({connectionString:databaseUrl});const client=await pool.connect();try{await client.query("SELECT pg_advisory_lock(hashtext('ts-commerce-schema-migrations'))");const bootstrapped=await bootstrapPublicSchemaIfNeeded(client);await client.query(`CREATE TABLE IF NOT EXISTS "_ts_commerce_migrations" (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);if(bootstrapped){
  for(const migrationId of BOOTSTRAP_RUNTIME_MIGRATIONS){
    const migrationPath=new URL(`../migrations/${migrationId}.sql`,import.meta.url);
    const migrationSql=await readFile(migrationPath,"utf8");
    await client.query(migrationSql);
  }
  await client.query('INSERT INTO "_ts_commerce_migrations" (id) SELECT UNNEST($1::text[]) ON CONFLICT (id) DO NOTHING',[migrations]);
}else for(const migrationId of migrations){
  const migrationPath=new URL(`../migrations/${migrationId}.sql`,import.meta.url);
  const migrationSql=await readFile(migrationPath,"utf8");
  const applied=await client.query<{id:string}>('SELECT id FROM "_ts_commerce_migrations" WHERE id=$1',[migrationId]);
  if(applied.rowCount)continue;
  await client.query("BEGIN");
  try{await client.query(migrationSql);await client.query('INSERT INTO "_ts_commerce_migrations" (id) VALUES ($1)',[migrationId]);await client.query("COMMIT");}
  catch(error){await client.query("ROLLBACK");throw error;}
} }
finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('ts-commerce-schema-migrations'))").catch(() => undefined);
  client.release();
  await pool.end();
}
}
