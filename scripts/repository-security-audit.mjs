#!/usr/bin/env node
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const failures = [];
const binaryExt = new Set([
  ".png",".jpg",".jpeg",".gif",".webp",".ico",".pdf",".zip",".gz",".tgz",".woff",".woff2",".ttf",".otf",".mp4",".mov",".avi",".mp3",".wav",".sqlite",".db"
]);
const ignoredDirs = new Set([".git","node_modules","dist","build","coverage",".next",".cache"]);

function isPlaceholder(value) {
  return /^(?:change[-_ ]?me|replace[-_ ]?me|your[-_ ]|example|test[-_ ]|ci[-_ ]|dummy|placeholder|changethis|secret)$/i.test(value.trim());
}

async function walk(dir) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const files = await walk(root);
const replitPattern = /(?:replit(?:\.app|\.dev)?|@replit\b)/i;
const secretPatterns = [
  { name: "private key material", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: "GitHub token", re: /\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]+/ },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]+/ },
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Flutterwave credential", re: /\bFLWSECK(?:_TEST)?-[A-Za-z0-9_-]{12,}/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
];

for (const file of files) {
  const relative = path.relative(root, file).replaceAll(path.sep, "/");
  const ext = path.extname(file).toLowerCase();
  if (binaryExt.has(ext)) continue;
  let source;
  try {
    const info = await stat(file);
    if (info.size > 2_000_000) continue;
    source = await readFile(file, "utf8");
  } catch { continue; }

  if (relative !== "scripts/repository-security-audit.mjs" && replitPattern.test(source)) {
    failures.push(`Replit trace remains: ${relative}`);
  }

  if (relative === "scripts/repository-security-audit.mjs") continue;

  for (const {name,re} of secretPatterns) {
    const match = source.match(re);
    if (!match) continue;
    const line = source.slice(0, match.index ?? 0).split("\n").length;
    const matched = match[0];
    if (
      isPlaceholder(matched) ||
      /(?:test|example|dummy|placeholder)(?:[-_]|$)/i.test(matched)
    ) continue;
    failures.push(`Possible ${name} in ${relative} near line ${line}`);
  }

  // Match only the value on the same line. Using \s* here can accidentally consume the next env key when an example value is intentionally blank.\n  const sensitiveAssignment = source.match(/^\s*\b(?:FLUTTERWAVE_SECRET_KEY|FLW_SECRET_KEY|FLUTTERWAVE_WEBHOOK_SECRET|FLW_WEBHOOK_HASH|SESSION_SECRET)\s*=\s*([^\\r\\n#]*?)\s*(?:#.*)?$/m);
  if (sensitiveAssignment) {
    const value = sensitiveAssignment[1];
    // Docker/Compose guards such as ${SESSION_SECRET:?set SESSION_SECRET}
    // are references to runtime environment values, not embedded credentials.
    if (!isPlaceholder(value) && !value.startsWith("${") && !value.startsWith("ci-only-")) {
      failures.push(`Non-placeholder sensitive credential assignment in ${relative}`);
    }
  }
}

if (failures.length) {
  console.error("Lunavo repository security audit: FAIL");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}

console.log("Lunavo repository security audit: PASS");
console.log("Checked repository text for prohibited Replit traces and high-confidence committed secret patterns.");
