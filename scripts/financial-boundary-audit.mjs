#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const apiRoots = [
  path.join(root, "artifacts/api-server/src/routes"),
  path.join(root, "artifacts/api-server/src/lib"),
];

const financialMutationMarkers = [
  /\.(?:insert)\((?:[^\n]*?)?(?:paymentsTable|paymentIntentsTable|paymentRecordsTable|ledgerEntriesTable|withdrawalsTable|refundRecordsTable|advertisingPaymentsTable|marketplaceBillingRecordsTable|tsPayTransfersTable)/s,
  /\.(?:update)\((?:[^\n]*?)?(?:paymentsTable|paymentIntentsTable|paymentRecordsTable|ledgerEntriesTable|withdrawalsTable|refundRecordsTable|advertisingPaymentsTable|marketplaceBillingRecordsTable|tsPayTransfersTable)/s,
  /\.(?:delete)\((?:[^\n]*?)?(?:paymentsTable|paymentIntentsTable|paymentRecordsTable|ledgerEntriesTable|withdrawalsTable|refundRecordsTable|advertisingPaymentsTable|marketplaceBillingRecordsTable|tsPayTransfersTable)/s,
  /INSERT\s+INTO\s+(?:payments|payment_intents|payment_records|ledger_entries|withdrawals|refund_records|advertising_payments|marketplace_billing_records|ts_pay_transfers)/i,
  /UPDATE\s+(?:payments|payment_intents|payment_records|ledger_entries|withdrawals|refund_records|advertising_payments|marketplace_billing_records|ts_pay_transfers)\b/i,
  /DELETE\s+FROM\s+(?:payments|payment_intents|payment_records|ledger_entries|withdrawals|refund_records|advertising_payments|marketplace_billing_records|ts_pay_transfers)\b/i,
];

const financialBoundaryFiles = new Set([
  "artifacts/api-server/src/routes/commerce.ts",
  "artifacts/api-server/src/routes/payment-boundary.ts",
  "artifacts/api-server/src/routes/flutterwave-payment-processor.ts",
  "artifacts/api-server/src/routes/flutterwave-webhook.ts",
  "artifacts/api-server/src/routes/marketplace-platform.ts",
  "artifacts/api-server/src/routes/commerce-growth.ts",
  "artifacts/api-server/src/routes/commerce-suite.ts",
  "artifacts/api-server/src/routes/ad-studio.ts",
  "artifacts/api-server/src/routes/ad-studio-stitch.ts",
  "artifacts/api-server/src/routes/daily-ai-advertising.ts",
  "artifacts/api-server/src/routes/ts-pay-transfers.ts",
  "artifacts/api-server/src/routes/product-auction-settlement.ts",
  "artifacts/api-server/src/routes/store-auction-payment.ts",
  "artifacts/api-server/src/lib/store-auction-settlement.ts",
  "artifacts/api-server/src/lib/product-auction-settlement.ts",
  "artifacts/api-server/src/lib/ts-pay-ledger.ts",
  "artifacts/api-server/src/lib/ts-pay-transaction-orchestrator.ts",
  "artifacts/api-server/src/lib/flutterwave-reconciliation.ts",
  "artifacts/api-server/src/lib/automation-guard.ts",
]);

const providerDomains = [
  "api.flutterwave.com",
  "api.x.com",
  "graph.facebook.com",
  "graph.instagram.com",
  "open.tiktokapis.com",
  "www.googleapis.com",
  "oauth2.googleapis.com",
  "api.linkedin.com",
  "api.pinterest.com",
];

const failures = [];

async function walk(dir) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) files.push(full);
  }
  return files;
}

for (const dir of apiRoots) {
  for (const file of await walk(dir)) {
    const rel = path.relative(root, file).replaceAll(path.sep, "/");
    const source = await readFile(file, "utf8");
    if (financialMutationMarkers.some((marker) => marker.test(source)) && !financialBoundaryFiles.has(rel)) {
      failures.push(`Financial mutation outside an approved server boundary: ${rel}`);
    }
  }
}

const webRoot = path.join(root, "artifacts/ts-commerce/src");
for (const file of await walk(webRoot)) {
  const rel = path.relative(root, file).replaceAll(path.sep, "/");
  const source = await readFile(file, "utf8");
  for (const domain of providerDomains) {
    if (source.includes(domain)) {
      failures.push(`Client bundle references provider API directly; route it through Lunavo server boundary: ${rel} -> ${domain}`);
    }
  }
  if (/localStorage\.(setItem|removeItem)\([^)]*(balance|ledger|payment|withdraw|subscription|earnings|wallet)/i.test(source)) {
    failures.push(`Client-side persistent financial state detected: ${rel}`);
  }
}

if (failures.length) {
  console.error("Lunavo financial-boundary audit: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Lunavo financial-boundary audit: PASS");
