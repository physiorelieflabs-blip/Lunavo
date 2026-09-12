#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const requiredFiles = [
  "artifacts/api-server/src/routes/storefront-publishing.ts",
  "artifacts/api-server/src/routes/storefront-domains.ts",
  "artifacts/api-server/src/routes/flutterwave-webhook.ts",
  "artifacts/api-server/src/routes/payment-boundary.ts",
  "artifacts/api-server/src/lib/ts-pay-ledger.ts",
  "artifacts/api-server/src/lib/tenant-access.ts",
  "artifacts/api-server/src/lib/autonomous-store-policy.ts",
  "artifacts/api-server/src/lib/merchant-abuse-policy.ts",
  "artifacts/api-server/src/lib/merchant-abuse-policy.test.ts",
];
const failures = [];
const read = async (path) => { try { return await readFile(path, "utf8"); } catch { failures.push(`Missing required file: ${path}`); return ""; } };
const packageJson = JSON.parse(await read("package.json"));
if (packageJson.name !== "lunavo") failures.push("Root package must be named lunavo");
if (JSON.stringify(packageJson).includes("@replit/")) failures.push("Root package still contains a Replit runtime dependency");
for (const file of requiredFiles) await read(file);
const publishing = await read(requiredFiles[0]);
for (const marker of ['router.get("/storefront-builder/:id/draft"','router.put("/storefront-builder/:id/draft"','router.post("/storefront-builder/:id/publish"','router.post("/storefront-builder/:id/unpublish"','router.get("/public/storefront/by-host"',"storefrontPublicationSnapshotsTable","createHash(\"sha256\")"]) if (!publishing.includes(marker)) failures.push(`Storefront publishing invariant missing: ${marker}`);
const domains = await read(requiredFiles[1]);
if (!domains.includes("resolveTxt")) failures.push("Custom-domain ownership verification must use DNS TXT resolution");
if (!domains.includes('status, "verified"')) failures.push("Public custom-domain resolution must require verified status");
const autonomy = await read(requiredFiles[6]);
for (const marker of ["STORE_AUCTION_MIN_VERIFIED_PROFIT_USD", "scoreProductOpportunity", "calculatePriceCeiling", "canMerchantAuctionStore", "normalizeDailyAdCount"]) if (!autonomy.includes(marker)) failures.push(`Autonomous-store invariant missing: ${marker}`);
const abuse = await read(requiredFiles[7]);
for (const marker of ["hasSelfPurchaseConflict", "referralAccountsConflict", "paymentCanCreateRevenue", "inventoryCanDecrement", "connectorMayPublish", "canTransferStoreOwnership", "auctionBidIsValid"]) if (!abuse.includes(marker)) failures.push(`Merchant-abuse invariant missing: ${marker}`);
if (failures.length) { console.error("Lunavo implementation audit: FAIL"); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log("Lunavo implementation audit: PASS");
