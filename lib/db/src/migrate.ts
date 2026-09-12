import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to run database migrations");

const migrations = [
  "0001_production_hardening", "0002_internal_commerce", "0003_withdrawals_and_supplier_imports", "0004_linked_bank_accounts", "0005_auto_dropshipping", "0006_checkout_quantity", "0007_supplier_import_workflows", "0008_merchant_currency", "0009_ai_operating_layer", "0010_authoritative_accounting", "0011_inventory_reservations_movements", "0012_withdrawal_pins", "0013_supplier_payments", "0014_checkout_pricing", "0015_customer_notes", "0016_customer_segments", "0016_commerce_growth_sourcing_marketplace", "0017_subscription_currency", "0018_ai_goals", "0019_payment_links", "0020_marketplace_management", "0021_invoices", "0022_invoice_accounting", "0023_domain_event_outbox", "0024_staff_roles_locations", "0025_operational_location_ownership", "0026_customer_management_permission", "0027_store_profile_details", "0028_advertising_payments", "0029_auctions", "0030_subscription_billing_timezone", "0031_whop_payment_reference", "0032_public_checkout_payments", "0033_provider_refund_tracking", "0034_whop_webhook_events", "0035_ts_pay_internal_bank", "0036_ts_pay_payout_accounting", "0037_flutterwave_webhook_events", "0038_storefront_builder", "0039_media_assets", "0040_transfer_entry_types_and_payment_link_orders", "0041_payment_intent_checkout_urls", "0042_referrals_and_payment_destinations", "0043_subscription_payment_choice_window", "0044_referral_reward_integrity", "0045_payment_settlement_snapshots", "0046_payment_destination_attempts", "0047_referral_free_month_milestone", "0048_critical_payment_referral_hardening", "0049_subscription_access_window_hardening", "0050_referral_discount_rate", "0051_storefront_entities_and_media_links", "0052_marketplace_ad_payment_link", "0053_commerce_suite_autods", "0054_self_hosted_ad_studio", "0055_social_hub", "0056_social_publishing_and_custom_ad_media", "0057_platform_integrations", "0058_storefront_domains", "0059_storefront_publication_snapshots", "0060_auction_integrity", "0061_lunavo_merchant_control_plane", "0062_automation_usage_and_audit", "0063_store_auction_lifecycle", "0064_daily_ai_advertising", "0065_store_auction_payment_verifications", "0066_product_auction_lifecycle", "0067_product_auction_settlement",
];

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(hashtext('ts-commerce-schema-migrations'))");
  await client.query(`CREATE TABLE IF NOT EXISTS "_ts_commerce_migrations" (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  for (const migrationId of migrations) {
    const migrationPath = new URL(`../migrations/${migrationId}.sql`, import.meta.url);
    const migrationSql = await readFile(migrationPath, "utf8");
    const applied = await client.query<{ id: string }>('SELECT id FROM "_ts_commerce_migrations" WHERE id = $1', [migrationId]);
    if (applied.rowCount) continue;
    await client.query("BEGIN");
    try {
      await client.query(migrationSql);
      await client.query('INSERT INTO "_ts_commerce_migrations" (id) VALUES ($1)', [migrationId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('ts-commerce-schema-migrations'))").catch(() => undefined);
  client.release();
  await pool.end();
}
