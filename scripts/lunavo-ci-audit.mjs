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
