#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const failures = [];
async function read(path) {
  try { return await readFile(path, "utf8"); }
  catch { failures.push("Missing required file: " + path); return ""; }
}

const required = [
  "artifacts/api-server/src/lib/ai-provider.ts",
  "artifacts/api-server/src/lib/pollinations.ts",
  "artifacts/api-server/src/routes/payment-boundary.ts",
  "artifacts/api-server/src/routes/flutterwave-webhook.ts",
  "artifacts/api-server/src/lib/tenant-access.ts",
  "artifacts/api-server/src/lib/ts-pay-ledger.ts","artifacts/api-server/src/lib/ts-pay-ledger-rules.ts",
  "artifacts/api-server/src/lib/ts-pay-transaction-orchestrator.ts",
  "artifacts/api-server/src/routes/storefront-publishing.ts",
  "artifacts/api-server/src/routes/storefront-domains.ts",
  "artifacts/api-server/src/routes/admin-integrations.ts",
  "artifacts/api-server/src/lib/local-auth.ts",
  "artifacts/api-server/src/routes/auth.ts",
  "artifacts/api-server/src/routes/automation-workflows.ts",
  "artifacts/api-server/src/routes/advanced-commerce.ts",
];

for (const path of required) await read(path);

const ai = await read("artifacts/api-server/src/lib/ai-provider.ts");
for (const marker of [
  "LUNAVO_LOCAL_LLM_POOL",
  "getLocalAiPool",
  "localAiPoolSummary",
  "Promise.allSettled",
  "local consensus",
]) if (!ai.includes(marker)) failures.push("AI gateway invariant missing: " + marker);
for (const forbidden of ["api.openai.com", "api.deepseek.com", "generativelanguage.googleapis.com", "api.anthropic.com"]) {
  if (ai.includes(forbidden)) failures.push("Hosted AI provider endpoint found in core gateway: " + forbidden);
}

const image = await read("artifacts/api-server/src/lib/pollinations.ts");
if (image.includes("image.pollinations.ai") || image.includes("generativelanguage.googleapis.com")) {
  failures.push("Hosted image provider found in core image gateway.");
}
if (!image.includes("LUNAVO_LOCAL_IMAGE_URL")) failures.push("Local image endpoint invariant missing.");

for (const path of [
  "artifacts/api-server/src/routes/subscription-options.ts",
  "artifacts/api-server/src/routes/marketplace-advertising-compat.ts",
  "artifacts/api-server/src/lib/middleware.ts",
  "artifacts/api-server/src/routes/payment-boundary.ts",
  "artifacts/api-server/src/routes/ad-studio-stitch.ts",
  "artifacts/api-server/src/routes/social-hub.ts",
  "artifacts/api-server/src/routes/ad-studio.ts",
  "artifacts/api-server/src/routes/storefront-domains.ts",
  "artifacts/api-server/src/routes/store-auctions.ts",
  "artifacts/api-server/src/routes/auth.ts",
  "artifacts/api-server/src/routes/admin-ai-store-creator-local.ts",
]) {
  const source = await read(path);
  if (!source.includes("localAuthUserId") && !source.includes("local_auth_user_id")) {
    failures.push("Linked local-auth tenant identity missing: " + path);
  }
}

const tenant = await read("artifacts/api-server/src/lib/tenant-access.ts");
if (!tenant.includes("localAuthUserId")) failures.push("Tenant authorization does not resolve local auth identity.");

const money = await read("artifacts/api-server/src/routes/payment-boundary.ts");
if (money.includes("payment_status") && /UPDATE[^\n]+payment_status\s*=\s*\$/.test(money)) failures.push("Payment boundary may trust client payment status.");
for (const marker of ["verifyFlutterwaveTransaction", "processVerifiedFlutterwaveTransaction"]) {
  if (!money.includes(marker)) failures.push("Provider verification invariant missing: " + marker);
}

const webhook = await read("artifacts/api-server/src/routes/flutterwave-webhook.ts");
for (const marker of ["webhook", "verify", "processVerifiedFlutterwaveTransaction"]) {
  if (!webhook.toLowerCase().includes(marker.toLowerCase())) failures.push("Flutterwave webhook verification path missing: " + marker);
}

const ledger = await read("artifacts/api-server/src/lib/ts-pay-ledger-rules.ts");
for (const marker of ["referenceKey", "currency", "amountMinor"]) {
  if (!ledger.includes(marker)) failures.push("TS Pay ledger invariant missing: " + marker);
}

const publishing = await read("artifacts/api-server/src/routes/storefront-publishing.ts");
for (const marker of ["FOR UPDATE", "storefrontPublicationSnapshotsTable", "published: true"]) {
  if (!publishing.includes(marker)) failures.push("Store publishing concurrency invariant missing: " + marker);
}

const localAuth = await read("artifacts/api-server/src/lib/local-auth.ts");
for (const marker of ["scrypt", "timingSafeEqual", "HttpOnly", "failed_login_attempts"]) {
  if (!localAuth.includes(marker)) failures.push("Local authentication security invariant missing: " + marker);
}

const workflows = await read("artifacts/api-server/src/routes/automation-workflows.ts");
for (const marker of ["dailyRunLimit", "cooldownSeconds", "approval", "idempot"]) {
  if (!workflows.toLowerCase().includes(marker.toLowerCase())) failures.push("Automation safety invariant missing: " + marker);
}

try { await readFile(".replit", "utf8"); failures.push("Obsolete Replit development configuration is present."); } catch {}

if (failures.length) {
  console.error("Lunavo CI audit: FAIL");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}
console.log("Lunavo CI audit: PASS");
