export const LUNAVO_FEATURE_COVERAGE = {
  commerce: ["stores","marketplace","products","variants","inventory","orders","customers","reviews","discounts","digital-products","courses","memberships","services","bookings","events","subscriptions"],
  operations: ["shipping","taxes","crm","marketing","analytics","domains","notifications","customer-accounts"],
  payments: ["TS Pay","checkout","payment-links","invoices","ledger","refunds","disputes","payouts","reconciliation","fraud-risk","provider-routing","settlement-currency"],
  platform: ["merchant-verification","KYC","master-admin","staff-authorization","2FA","sessions","security","audit-logs","API","webhooks","integrations","mobile-parity"],
  intelligence: ["Commerce Suite","Frontier Lab","local-language","local-image","local-video","workflow-assistance"],
  ingestion: ["supplier-product-URL","public-data-extraction","review-map-edit-import"],
  commercialRules: ["$30 monthly merchant subscription","unlimited stores","marketplace $5 monthly","marketplace $5 per listed product","1% transaction fee","period-bound referral code","30% / $9 next-month referral discount"]
} as const;
