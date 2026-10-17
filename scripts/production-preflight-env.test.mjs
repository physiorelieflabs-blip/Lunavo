import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { after, test } from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const preflightPath = fileURLToPath(new URL("./production-preflight.mjs", import.meta.url));
const testRoot = mkdtempSync(path.join(tmpdir(), "lunavo-preflight-env-"));
after(() => rmSync(testRoot, { recursive: true, force: true }));

const validEnvFile = [
  "DATABASE_URL=postgresql://lunavo:ci-only-password@localhost:5432/lunavo",
  "SESSION_SECRET=ci-only-session-secret-not-for-production",
  "APP_BASE_URL=https://lunavo.example.invalid",
  "LUNAVO_MASTER_ADMIN_EMAIL=ci-admin@example.invalid",
].join("\n") + "\n";

function makeDir(name, envFile) {
  const dir = path.join(testRoot, name);
  mkdirSync(dir, { recursive: true });
  if (envFile !== null) writeFileSync(path.join(dir, ".env"), envFile);
  return dir;
}

function runPreflight(cwd, extraEnv = {}) {
  return spawnSync(process.execPath, [preflightPath, "--strict"], {
    cwd,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", ...extraEnv },
  });
}

test("strict production preflight loads required values from a local .env file", () => {
  const cwd = makeDir("dotenv-load", validEnvFile);
  const result = runPreflight(cwd);

  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /Lunavo production preflight: PASS/);
});

test("already-exported variables take precedence over .env values", () => {
  const cwd = makeDir("dotenv-precedence", validEnvFile);
  const result = runPreflight(cwd, { APP_BASE_URL: "http://override.example.invalid" });

  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.match(result.stderr, /APP_BASE_URL must use HTTPS/);
});

test("strict preflight still works without .env when deployment variables are injected", () => {
  const cwd = makeDir("injected-env", null);
  const result = runPreflight(cwd, {
    DATABASE_URL: "postgresql://lunavo:ci-only-password@localhost:5432/lunavo",
    SESSION_SECRET: "ci-only-session-secret-not-for-production",
    APP_BASE_URL: "https://lunavo.example.invalid",
    LUNAVO_MASTER_ADMIN_EMAIL: "ci-admin@example.invalid",
  });

  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /Lunavo production preflight: PASS/);
});
