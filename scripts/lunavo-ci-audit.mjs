#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";

const failures = [];
const sources = new Map();

async function read(path) {
  if (sources.has(path)) return sources.get(path);
  try {
    const value = await readFile(path, "utf8");
    sources.set(path, value);
    return value;
  } catch {
    failures.push("Required launch-invariant source file is missing: " + path);
    sources.set(path, "");
    return "";
  }
}

function requireMarkers(label, source, markers) {
  for (const marker of markers) {
    if (!source.includes(marker)) failures.push(label + " is missing required invariant: " + marker);
  }
}

function forbidMarkers(label, source, markers) {
  for (const marker of markers) {
    if (source.includes(marker)) failures.push(label + " contains forbidden marker: " + marker);
  }
}

const paths = [
  "artifacts/api-server/src/lib/ai-provider.ts",
  "artifacts/api-server/src/lib/self-hosted-ai.ts",
  "artifacts/api-server/src/lib/pollinations.ts",
  "artifacts/api-server/src/routes/payment-boundary.ts",
  "artifacts/api-server/src/routes/flutterwave-webhook.ts",
  "artifacts/api-server/src/lib/ts-pay-ledger.ts",
  "artifacts/api-server/src/lib/ts-pay-ledger-rules.ts",
  "artifacts/api-server/src/lib/ts-pay-transaction-orchestrator.ts",
  "artifacts/api-server/src/lib/tenant-access.ts",
  "artifacts/api-server/src/lib/local-auth.ts",
  "artifacts/api-server/src/routes/auth.ts",
  "artifacts/api-server/src/routes/storefront-publishing.ts",
  "artifacts/api-server/src/routes/storefront-domains.ts",
  "artifacts/api-server/src/routes/admin-integrations.ts",
  "artifacts/api-server/src/routes/automation-workflows.ts",
  "artifacts/api-server/src/routes/advanced-commerce.ts",
  "artifacts/api-server/src/routes/dashboard-transactions.ts",
  "artifacts/api-server/src/routes/flutterwave-payment-processor.ts",
  "artifacts/api-server/src/lib/store-auction-settlement.ts",
  "artifacts/api-server/src/lib/product-auction-settlement.ts",
  "artifacts/api-server/src/bootstrap-master-admin.ts",
  "lib/db/src/migration-runner.ts",
  "lib/db/migrations/0129_merchant_sale_release_gate.sql",
  "artifacts/ts-commerce/src/pages/admin-transactions.tsx",
  "scripts/production-preflight.mjs",
  ".github/workflows/ci.yml",
  "docker-compose.yml",
  "Caddyfile",
];

await Promise.all(paths.map(read));

const ai = sources.get("artifacts/api-server/src/lib/ai-provider.ts") ?? "";
const localAi = sources.get("artifacts/api-server/src/lib/self-hosted-ai.ts") ?? "";
const image = sources.get("artifacts/api-server/src/lib/pollinations.ts") ?? "";
const payments = sources.get("artifacts/api-server/src/routes/payment-boundary.ts") ?? "";
const webhook = sources.get("artifacts/api-server/src/routes/flutterwave-webhook.ts") ?? "";
const ledgerRules = sources.get("artifacts/api-server/src/lib/ts-pay-ledger-rules.ts") ?? "";
const publishing = sources.get("artifacts/api-server/src/routes/storefront-publishing.ts") ?? "";
const localAuth = sources.get("artifacts/api-server/src/lib/local-auth.ts") ?? "";
const automations = sources.get("artifacts/api-server/src/routes/automation-workflows.ts") ?? "";
const bootstrap = sources.get("artifacts/api-server/src/bootstrap-master-admin.ts") ?? "";
const preflight = sources.get("scripts/production-preflight.mjs") ?? "";
const compose = sources.get("docker-compose.yml") ?? "";
const caddy = sources.get("Caddyfile") ?? "";
const ciWorkflow = sources.get(".github/workflows/ci.yml") ?? "";
const saleReleaseApi = sources.get("artifacts/api-server/src/routes/dashboard-transactions.ts") ?? "";
const saleReleasePayments = sources.get("artifacts/api-server/src/routes/flutterwave-payment-processor.ts") ?? "";
const storeAuctionSettlement = sources.get("artifacts/api-server/src/lib/store-auction-settlement.ts") ?? "";
const productAuctionSettlement = sources.get("artifacts/api-server/src/lib/product-auction-settlement.ts") ?? "";
const releaseMigration = sources.get("lib/db/migrations/0129_merchant_sale_release_gate.sql") ?? "";
const releaseUi = sources.get("artifacts/ts-commerce/src/pages/admin-transactions.tsx") ?? "";
const migrationRunner = sources.get("lib/db/src/migration-runner.ts") ?? "";

// The brain and its specialist ensemble must use the maintained local model
// router. Do not pin this audit to removed model-pool names or implementation
// details that belong to an earlier revision.
requireMarkers("Local AI brain", ai, [
  "completeLocalChat",
  "completeLocalEnsemble",
  "ROLE_PROFILES",
  "REQUIRED_SPECIALISTS",
  "classifyLunavoModelDiversity",
]);
requireMarkers("Self-hosted model router", localAi, [
  "assertSelfHostedEndpoint",
  "LUNAVO_LOCAL_LLM_URL",
  "LUNAVO_LOCAL_AI_BASE_URL",
  "LUNAVO_LOCAL_AI_MAX_PARALLEL",
  "completeLocalEnsemble",
  "private/local network address",
]);
forbidMarkers("Local AI brain", ai, [
  "api.openai.com",
  "api.deepseek.com",
  "generativelanguage.googleapis.com",
  "api.anthropic.com",
]);
forbidMarkers("Self-hosted model router", localAi, [
  "api.openai.com",
  "api.deepseek.com",
  "generativelanguage.googleapis.com",
  "api.anthropic.com",
]);
requireMarkers("Self-hosted image gateway", image, [
  "LUNAVO_LOCAL_IMAGE_URL",
  "Self-hosted image generation is not configured",
]);
forbidMarkers("Self-hosted image gateway", image, [
  "image.pollinations.ai",
  "generativelanguage.googleapis.com",
]);

// Money state may only change after server-side provider verification. The
// webhook must validate its signature and deduplicate deliveries; TS Pay ledger
// rules must retain a stable reference, currency, and exact minor-unit amount.
requireMarkers("Payment verification boundary", payments, [
  "verifyFlutterwaveTransaction",
  "processVerifiedFlutterwaveTransaction",
  "frontend payment_status flags are not payment evidence",
]);
requireMarkers("Flutterwave webhook", webhook, [
  "verifyFlutterwaveWebhookSignatureAsync",
  "paymentWebhookEventsTable",
  "processVerifiedFlutterwaveTransaction",
  "eventIdFrom",
]);
requireMarkers("TS Pay ledger rules", ledgerRules, [
  "referenceKey",
  "currency",
  "amountMinor",
]);

// Publishing uses a locked state transition and persisted snapshot. Local auth
// keeps a slow password hash, timing-safe comparison, secure cookie attributes,
// and failed-login tracking. Automations remain bounded and approval-aware.
requireMarkers("Storefront publishing", publishing, [
  "FOR UPDATE",
  "storefrontPublicationSnapshotsTable",
  "published: true",
]);
requireMarkers("Local authentication", localAuth, [
  "scrypt",
  "timingSafeEqual",
  "HttpOnly",
  "failed_login_attempts",
]);
requireMarkers("Automation safety", automations, [
  "dailyRunLimit",
  "cooldownSeconds",
  "approval",
  "idempot",
  "protectedFeatureKeyPrefixes",
]);
requireMarkers("One-time Master Admin bootstrap", bootstrap, [
  "pg_advisory_xact_lock(hashtext('lunavo-master-admin-bootstrap'))",
  "A Master Admin already exists",
  "Bootstrap is one-time only",
  "INSERT INTO local_auth_users",
]);
forbidMarkers("One-time Master Admin bootstrap", bootstrap, [
  "UPDATE local_auth_users SET email=$1",
]);
requireMarkers("Production preflight", preflight, [
  "POSTGRES_PASSWORD",
  "SESSION_SECRET",
  "LUNAVO_DOMAIN",
  "APP_BASE_URL",
  "reserved or placeholder hostname",
  "--live-money",
  "LUNAVO_PREFLIGHT_TEST_MODE",
]);
requireMarkers("Caddy automatic HTTPS config", caddy, [
  "LUNAVO_DOMAIN",
  "reverse_proxy lunavo:5000",
  "encode zstd gzip",
]);
requireMarkers("Production edge compose profile", compose, [
  'profiles: ["production-edge"]',
  "caddy_data:/data",
  '"80:80"',
  '"443:443"',
]);
requireMarkers("CI production-preflight fixture", ciWorkflow, [
  'LUNAVO_PREFLIGHT_TEST_MODE: "1"',
  "pnpm run preflight:production",
]);
requireMarkers("Database-enforced sale release gate", releaseMigration, [
  "CREATE TABLE IF NOT EXISTS merchant_sale_release_requests",
  "NEW.entry_type = 'sale' AND NEW.amount_minor > 0",
  "sale_release_hold",
  "legacy_balance",
  "Pre-cutover positive balance frozen for Master Admin review",
]);
requireMarkers("Release migration registration", migrationRunner, [
  "0129_merchant_sale_release_gate",
]);
requireMarkers("Master Admin sale-release API", saleReleaseApi, [
  "pendingSaleReleases",
  '/admin/dashboard/sale-releases/:id/approve',
  "requireMasterAdmin(userId)",
  "sale_release",
  "open_reconciliation_exception",
  "reviewed_by",
  "sale_hold_missing_or_mismatch",
  "sale_ledger_mismatch",
  "release_marker_exists",
]);
requireMarkers("Sale-reversal and dispute safety", saleReleasePayments, [
  "sale-release-cancel:",
  "sale-dispute-hold:",
  "sale-dispute-cancel:",
  "merchant_sale_release_requests",
  '["successful", "verified", "disputed"]',
]);
requireMarkers("Store auction release evidence", storeAuctionSettlement, [
  "merchant_sale_release_requests",
  "provider_transaction_id",
]);
requireMarkers("Product auction release evidence", productAuctionSettlement, [
  "merchant_sale_release_requests",
  "provider_transaction_id",
]);
requireMarkers("Master Admin release UI", releaseUi, [
  "Mandatory pre-release gate",
  "Approve release",
  "Finance review note",
  "/api/admin/dashboard/sale-releases/",
]);

try {
  await access(".replit");
  failures.push("Obsolete Replit runtime configuration (.replit) must not be present.");
} catch {
  // The expected state is that .replit does not exist.
}

if (failures.length) {
  console.error("Lunavo launch-invariant audit: FAIL");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}

console.log("Lunavo launch-invariant audit: PASS (" + sources.size + " source files checked)");
