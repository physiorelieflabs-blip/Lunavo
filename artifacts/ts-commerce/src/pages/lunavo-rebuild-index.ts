export const LUNAVO_REBUILD_SURFACES = [
  "command-center","orders","products","inventory","customers","marketing","analytics","store-builder","themes","branding","marketplace","shipping","taxes","payments","payouts","discounts","reviews","digital-products","courses","memberships","services","bookings","events","subscriptions","domains","integrations","api","settings","commerce-suite","frontier-lab","master-admin","referrals","kyc","security","audit","notifications","crm","customer-accounts","mobile-parity","supplier-url-ingestion","ts-pay-checkout","payment-links","invoices","ledger","refunds","disputes","reconciliation","fraud-risk","provider-routing","settlement","currency","self-hosted-language","self-hosted-image","self-hosted-video"
] as const;

export const LUNAVO_FINANCIAL_INVARIANTS = [
  "No fabricated payment success",
  "No fabricated balances or bank destinations",
  "Provider-authenticated confirmation required",
  "Webhook authenticity and provider re-verification required",
  "Idempotent transaction and webhook handling",
  "Transaction and settlement currencies remain distinct",
  "Actual provider fees remain distinct from Lunavo's 1% fee",
  "Merchant net is derived from recorded financial components",
  "Refunds, reversals, disputes and chargebacks remain traceable",
  "Reconciliation exceptions do not silently credit merchants"
] as const;
