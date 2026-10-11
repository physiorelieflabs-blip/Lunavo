#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runnerPath = path.join(root, "lib/db/src/migration-runner.ts");
const migrationDirectory = path.join(root, "lib/db/migrations");

// These two pre-existing legacy migrations are intentionally unregistered because
// their functionality is superseded by later canonical migrations. New exceptions
// should require an explicit code review instead of silently skipping a migration.
const LEGACY_UNREGISTERED_MIGRATIONS = new Set([
  "0053_marketplace_product_advertising",
  "0055_social_publishing_and_custom_ad_media",
]);

function fail(message) {
  console.error("[migration-registry] FAIL: " + message);
  process.exitCode = 1;
}

function readRegistry(source, pattern, name) {
  const match = source.match(pattern);
  if (!match) {
    fail("Could not locate " + name + " in lib/db/src/migration-runner.ts");
    return [];
  }
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((entry) => entry[1]);
}

function duplicates(values) {
  const seen = new Set();
  const repeats = new Set();
  for (const value of values) {
    if (seen.has(value)) repeats.add(value);
    seen.add(value);
  }
  return [...repeats];
}

const source = await readFile(runnerPath, "utf8");
const main = readRegistry(source, /const\\s+migrations\\s*=\\s*\\[([\\s\\S]*?)\\];/, "canonical migrations");
const bootstrap = readRegistry(
  source,
  /const\\s+BOOTSTRAP_RUNTIME_MIGRATIONS\\s*=\\s*\\[([\\s\\S]*?)\\]\\s+as\\s+const/,
  "clean-database bootstrap migrations",
);
const disk = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith(".sql"))
  .map((name) => name.slice(0, -4))
  .sort();
const onDisk = new Set(disk);
const registered = new Set(main);

for (const [name, values] of [["canonical", main], ["bootstrap", bootstrap]]) {
  for (const repeated of duplicates(values)) fail(name + " registry contains duplicate ID: " + repeated);
}
for (const id of main) {
  if (!onDisk.has(id)) fail("registered migration SQL file is missing: " + id + ".sql");
}
for (const id of disk) {
  if (!registered.has(id) && !LEGACY_UNREGISTERED_MIGRATIONS.has(id)) {
    fail("migration SQL is not registered in the canonical runner: " + id + ".sql");
  }
}
for (const legacy of LEGACY_UNREGISTERED_MIGRATIONS) {
  if (!onDisk.has(legacy)) fail("legacy exception no longer exists; remove it from the exception list: " + legacy);
  if (registered.has(legacy)) fail("legacy exception is now registered; remove it from the exception list: " + legacy);
}

const runtimeMigrations = main.filter((id) => Number.parseInt(id.slice(0, 4), 10) >= 84);
const bootstrapSet = new Set(bootstrap);
for (const id of runtimeMigrations) {
  if (!bootstrapSet.has(id)) fail("fresh-database bootstrap omits runtime migration: " + id);
}
for (const id of bootstrap) {
  if (!registered.has(id)) fail("bootstrap migration is absent from canonical migration list: " + id);
}

if (process.exitCode) {
  console.error("[migration-registry] Checked " + disk.length + " SQL files, " + main.length + " canonical entries and " + bootstrap.length + " bootstrap entries.");
} else {
  console.log("[migration-registry] OK: " + disk.length + " SQL files, " + main.length + " canonical entries, " + bootstrap.length + " bootstrap entries; all non-legacy migrations are registered and runtime migrations are included in clean bootstrap.");
}
