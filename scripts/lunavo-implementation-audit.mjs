#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const requiredFiles = [
  "artifacts/api-server/src/routes/storefront-publishing.ts",
  "artifacts/api-server/src/routes/storefront-domains.ts",
  "artifacts/api-server/src/routes/flutterwave-webhook.ts",
  "artifacts/api-server/src/routes/payment-boundary.ts",
  "artifacts/api-server/src/lib/ts-pay-ledger.ts",
  "artifacts/api-server/src/lib/ts-pay-transaction-orchestrator.ts",
  "artifacts/api-server/src/lib/tenant-access.ts",
  "artifacts/api-server/src/lib/autonomous-store-policy.ts",
  "artifacts/api-server/src/lib/autonomous-store-engine.ts",
  "artifacts/api-server/src/lib/merchant-abuse-policy.ts",
  "artifacts/api-server/src/lib/merchant-abuse-policy.test.ts",
  "artifacts/api-server/src/lib/auctioneer-ai.ts",
  "artifacts/api-server/src/routes/auctioneer-ai.ts",
  "artifacts/api-server/src/routes/auctioneer-live-analysis.ts",
  "artifacts/api-server/src/routes/dashboard-transactions.ts",
  "artifacts/api-server/src/routes/merchant-financials.ts",
  "artifacts/api-server/src/routes/ai-automation.ts",
  "artifacts/api-server/src/lib/store-auction-settlement.ts",
  "artifacts/api-server/src/lib/product-auction-settlement.ts",
  "artifacts/api-server/src/lib/daily-ai-advertising-worker.ts",
  "lib/db/migrations/0068_auctioneer_ai_and_dashboard_transactions.sql",
  "lib/db/migrations/0070_ts_pay_transaction_boundary.sql",
  "lib/db/migrations/0071_ts_pay_internal_transfer_ledger.sql",
  "lib/db/src/migrate.ts",
];
const failures = [];
const read = async (path) => { try { return await readFile(path, "utf8"); } catch { failures.push(`Missing required file: ${path}`); return ""; } };
const readOptional = async (path) => { try { return await readFile(path, "utf8"); } catch { return ""; } };
const packageJson = JSON.parse(await read("package.json"));
if (packageJson.name !== "lunavo") failures.push("Root package must be named lunavo");
if (JSON.stringify(packageJson).includes("@replit/")) failures.push("Root package still contains a Replit runtime dependency");
for (const file of requiredFiles) await read(file);
const publishing = await read(requiredFiles[0]);
for (const marker of ['router.get("/storefront-builder/:id/draft"','router.put("/storefront-builder/:id/draft"','router.post("/storefront-builder/:id/publish"','router.post("/storefront-builder/:id/unpublish"','router.get("/public/storefront/by-host"',"storefrontPublicationSnapshotsTable","createHash(\"sha256\")"]) if (!publishing.includes(marker)) failures.push(`Storefront publishing invariant missing: ${marker}`);
const domains = await read(requiredFiles[1]);
if (!domains.includes("resolveTxt")) failures.push("Custom-domain ownership verification must use DNS TXT resolution");
if (!domains.includes('status, "verified"')) failures.push("Public custom-domain resolution must require verified status");
const autonomy = await read(requiredFiles[7]);
for (const marker of ["STORE_AUCTION_MIN_VERIFIED_PROFIT_USD", "scoreProductOpportunity", "calculatePriceCeiling", "canMerchantAuctionStore", "normalizeDailyAdCount"]) if (!autonomy.includes(marker)) failures.push(`Autonomous-store invariant missing: ${marker}`);
const engine = await read(requiredFiles[8]);
for (const marker of ["buildAutonomousOpportunity", "rankAutonomousOpportunities", "buildDailyAdSlots", "maximumCommercialPriceMinor"]) if (!engine.includes(marker)) failures.push(`Autonomous-store engine invariant missing: ${marker}`);
const abuse = await read(requiredFiles[9]);
for (const marker of ["hasSelfPurchaseConflict", "referralAccountsConflict", "paymentCanCreateRevenue", "inventoryCanDecrement", "connectorMayPublish", "canTransferStoreOwnership", "auctionBidIsValid"]) if (!abuse.includes(marker)) failures.push(`Merchant-abuse invariant missing: ${marker}`);
const auctioneer = await read(requiredFiles[11]);
for (const marker of ["maximize_value", "buildAuctioneerStrategy", "fake bidders", "fake bids", "seller floor"]) if (!auctioneer.includes(marker)) failures.push(`Auctioneer AI safety invariant missing: ${marker}`);
const auctioneerRoute = await read(requiredFiles[12]);
for (const marker of ["/merchant/store-auctions/:id/auctioneer-ai", "enabled", "strategyMode"]) if (!auctioneerRoute.includes(marker)) failures.push(`Auctioneer AI control route missing: ${marker}`);
const liveAuctioneer = await read(requiredFiles[13]);
for (const marker of ["bidHistory", "buildAuctioneerStrategy", "sellerMerchantId"]) if (!liveAuctioneer.includes(marker)) failures.push(`Live auctioneer analysis invariant missing: ${marker}`);
const dashboard = await read(requiredFiles[14]);
for (const marker of ["/merchant/dashboard/transactions", "TS Pay ledger + verified provider settlement", "not an external bank account", "ledger_entries"]) if (!dashboard.includes(marker)) failures.push(`Dashboard transaction boundary missing: ${marker}`);
const financials = await read(requiredFiles[15]);
for (const marker of ["/merchant/dashboard/balance", "TS Pay ledger", "availableBalanceMinor", "isExternalBankAccount: false"]) if (!financials.includes(marker)) failures.push(`Merchant financial control-plane invariant missing: ${marker}`);
const automation = await read(requiredFiles[16]);
for (const marker of ["/merchant/ai/opportunities/score", "/merchant/ai/pricing/recommend", "/merchant/ai/actions/reserve", "reserveAutomationActionInTransaction", "merchant_automation_audit"]) if (!automation.includes(marker)) failures.push(`AI automation control-plane invariant missing: ${marker}`);
const storeSettlement = await read(requiredFiles[17]);
for (const marker of ["store-auction-sale:", "ledger_entries", "store_auction_payment_verifications", "transaction_kind", "verification_state", "merchant_net_minor"]) if (!storeSettlement.includes(marker)) failures.push(`Store-auction TS Pay settlement invariant missing: ${marker}`);
const productSettlement = await read(requiredFiles[18]);
for (const marker of ["product-auction:", "ledger_entries", "product_auction_settlements", "product-auction", "merchant_net_minor"]) if (!productSettlement.includes(marker)) failures.push(`Product-auction TS Pay settlement invariant missing: ${marker}`);
const adWorker = await read(requiredFiles[19]);
for (const marker of ["runDailyAiAdvertisingPlanner", "ai_daily_ad_plans", "merchant_automation_audit", "ON CONFLICT"]) if (!adWorker.includes(marker)) failures.push(`Daily advertising worker invariant missing: ${marker}`);
const migration = await read(requiredFiles[20]);
for (const marker of ["auctioneer_ai_settings", "auctioneer_ai_recommendations", "lunavo_dashboard_transactions"]) if (!migration.includes(marker)) failures.push(`Transaction/auctioneer schema missing: ${marker}`);
const transactionBoundary = await read(requiredFiles[21]);
for (const marker of ["transaction_kind", "verification_state", "verified_at", "lunavo_project_ledger_to_dashboard"]) if (!transactionBoundary.includes(marker)) failures.push(`TS Pay transaction control-plane invariant missing: ${marker}`);
const internalTransfer = await read(requiredFiles[22]);
for (const marker of ["internal_transfer_out", "internal_transfer_in", "ledger_entries_entry_type_check"]) if (!internalTransfer.includes(marker)) failures.push(`TS Pay internal-transfer ledger invariant missing: ${marker}`);
const migrationRunner = await read(requiredFiles[23]);
for (const marker of ['"0070_ts_pay_transaction_boundary"','"0071_ts_pay_internal_transfer_ledger"']) if (!migrationRunner.includes(marker)) failures.push(`Migration runner does not include ${marker}`);
if (await readOptional("artifacts/ts-commerce/.replit-artifact/artifact.toml")) failures.push("Legacy artifacts/ts-commerce/.replit-artifact/artifact.toml still exists");
if (failures.length) { console.error("Lunavo implementation audit: FAIL"); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log("Lunavo implementation audit: PASS");
