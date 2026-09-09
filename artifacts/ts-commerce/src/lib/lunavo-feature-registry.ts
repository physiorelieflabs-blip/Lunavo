/**
 * Canonical Lunavo product-surface registry.
 * This is an inventory/coverage contract, not a claim that every capability is
 * already wired. Implementations must connect each surface to real server APIs.
 */
export const LUNAVO_FEATURES = [
  // Platform & merchant
  'multi_country','multi_currency','multi_store','merchant_onboarding','merchant_verification','kyc_before_payouts','merchant_dashboard','store_dashboard','staff_roles','permissions','audit_logs','notifications','email_notifications','sms_notifications','customer_accounts',
  // Catalogue & commerce
  'products','variants','skus','physical_products','digital_products','courses','memberships','services','bookings','events','tickets','subscriptions','product_reviews','catalogue_import','supplier_product_url_ingestion','product_media','product_options','bundles','gift_cards','pos',
  // Orders & customer operations
  'orders','order_status_lifecycle','order_notes','returns','refunds','partial_refunds','customers','customer_profiles','customer_segments','crm','invoices','receipts','connected_records',
  // Storefront
  'store_builder','themes','branding','navigation','custom_domains','responsive_storefront','public_storefront','general_store','marketplace_discovery','seo','media_library',
  // Marketplace
  'optional_marketplace','merchant_marketplace_enrollment','marketplace_product_listing','marketplace_subscription_fee','marketplace_per_product_fee','marketplace_orders','marketplace_reporting','product_advertising','advertising_eligibility','auctions','auction_management','shopper_experience','ai_concierge',
  // TS Pay / finance
  'ts_pay','checkout','payment_links','payment_intents','provider_adapters','flutterwave_adapter','paystack_adapter','stripe_adapter','paypal_adapter','provider_webhooks','webhook_authentication','provider_reverification','payment_deduplication','payment_state_machine','transaction_ledger','transaction_currency','settlement_currency','provider_fee_tracking','lunavo_transaction_fee','merchant_net','balances','payout_requests','manual_withdrawals','payout_approval','reconciliation','reconciliation_exceptions','disputes','chargebacks','reversals','payment_routing','financial_reporting',
  // Subscription & referral
  'merchant_subscription','subscription_billing','thirty_dollar_plan','unlimited_stores','referral_codes','referral_period_expiry','referral_attribution','referral_rewards','thirty_percent_next_month_discount','referral_idempotency','self_referral_protection','referral_reversal_on_refund',
  // Fulfilment, tax, growth
  'shipping','manual_shipping','carrier_shipping','automatic_shipping_rates','tracking','local_delivery','pickup','international_shipping','taxes','tax_regions','optional_tax_automation','discounts','marketing','campaigns','analytics','attribution','reporting',
  // Developer
  'merchant_api_keys','api_scopes','key_rotation','webhook_secrets','api_usage_logs','api_usage_limits','developer_docs','integrations','events',
  // Intelligence
  'commerce_suite','frontier_lab','self_hosted_language_runtime','self_hosted_image_worker','self_hosted_video_worker','local_ai_endpoint','ai_workflow_assistance','ai_content_generation','ai_product_intelligence','ai_safety_boundaries','ai_cannot_move_money','ai_cannot_edit_ledger','ai_cannot_bypass_permissions',
  // Administration & security
  'master_admin','admin_merchant_controls','admin_store_controls','admin_marketplace_controls','admin_payment_controls','admin_payout_controls','admin_kyc_controls','admin_referral_controls','platform_settings','two_factor_authentication','login_alerts','device_management','session_management','suspicious_login_detection','rate_limiting','brute_force_protection','secure_account_recovery','session_revocation','security_audit',
  // Infrastructure
  'postgresql','server_side_validation','idempotency','observability','error_boundaries','health_checks','production_preflight','mobile_responsive_ui','accessibility','reduced_motion','dark_mode',
] as const;

export type LunavoFeature = typeof LUNAVO_FEATURES[number];
export const LUNAVO_FEATURE_COUNT = LUNAVO_FEATURES.length;

export function hasLunavoFeature(feature: string): feature is LunavoFeature {
  return (LUNAVO_FEATURES as readonly string[]).includes(feature);
}
