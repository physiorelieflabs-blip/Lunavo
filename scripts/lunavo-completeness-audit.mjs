import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const ignored = new Set(["node_modules", ".git", "dist", ".next", "coverage"]);
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".yml", ".yaml", ".sql", ".md"]);

function walk(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (extensions.has(path.slice(path.lastIndexOf(".")))) files.push(path);
  }
  return files;
}

const files = walk(root);
const source = files.map((file) => ({ file: relative(root, file), text: readFileSync(file, "utf8") }));
const failures = [];
const warnings = [];

function requirePattern(name, pattern) {
  if (!source.some(({ text }) => pattern.test(text))) failures.push(name);
}
function warnPattern(name, pattern) {
  if (source.some(({ text }) => pattern.test(text))) warnings.push(name);
}

requirePattern("self-hosted runtime policy", /externalApiKeyRequired\s*:\s*false|externalAiKeys\s*:\s*false/);
requirePattern("Flutterwave integration boundary", /FLUTTERWAVE_SECRET_KEY|FLW_SECRET_KEY/);
requirePattern("TS Pay/payment state model", /reconciliation_required|provider_confirmed|charged_back/);
requirePattern("referral period model", /referralPeriodsTable|periodKey/);
requirePattern("referral fraud controls", /riskScore|riskSignals|riskStatus/);
requirePattern("CI workflow", /\.github[\\/]workflows[\\/]lunavo-ci\.yml/);

warnPattern("LEGACY REFERRAL MILESTONE STILL PRESENT: remove 150-referral/free-month logic", /REFERRAL_FREE_REFERRAL_MILESTONE|150_verified_referrals|REFERRAL_FREE_MONTHS/);
warnPattern("CLERK AUTH STILL PRESENT: self-hosted auth migration is incomplete", /@clerk\//);
warnPattern("Potential frontend-controlled payment success marker", /localStorage\.(setItem|set)\([^\n]*(paid|payment|success)/i);
warnPattern("Potential hard-coded live secret", /(?:sk_live|FLWSECK-|FLWSECK_TEST-|xkeysib-|whsec_)[A-Za-z0-9_-]{12,}/);

console.log(`Lunavo completeness audit: scanned ${source.length} source/config files.`);
if (failures.length) {
  console.error("FAILURES:");
  for (const item of failures) console.error(`- ${item}`);
  process.exitCode = 1;
}
if (warnings.length) {
  console.warn("WARNINGS:");
  for (const item of warnings) console.warn(`- ${item}`);
}
if (!failures.length && !warnings.length) console.log("No architecture completeness warnings detected.");
