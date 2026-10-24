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
const testPassword = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const testSession = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
const validEnvFile = [
  "POSTGRES_PASSWORD=" + testPassword,
  "DATABASE_URL=postgres://lunavo:" + testPassword + "@postgres:5432/lunavo",
  "SESSION_SECRET=" + testSession,
  "APP_BASE_URL=https://lunavo.example.invalid",
  "LUNAVO_DOMAIN=lunavo.example.invalid",
  "LUNAVO_MASTER_ADMIN_EMAIL=ci-admin@example.invalid",
].join("\n") + "\n";

function makeDir(name, envFile) {
  const dir = path.join(testRoot, name);
  mkdirSync(dir, { recursive: true });
  if (envFile !== null) writeFileSync(path.join(dir, ".env"), envFile);
  return dir;
}
function runPreflight(cwd, extraEnv = {}) {
  return spawnSync(process.execPath, [preflightPath, "--strict", "--public-deploy"], {
    cwd, encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...extraEnv },
  });
}
test("strict preflight loads required values from a local .env file", () => {
  const result = runPreflight(makeDir("dotenv-load", validEnvFile), { LUNAVO_PREFLIGHT_TEST_MODE: "1" });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /Lunavo production preflight: PASS/);
});
test("already-exported variables take precedence over .env values", () => {
  const result = runPreflight(makeDir("dotenv-precedence", validEnvFile), {
    LUNAVO_PREFLIGHT_TEST_MODE: "1", APP_BASE_URL: "http://override.example.invalid",
  });
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.match(result.stderr, /APP_BASE_URL must use HTTPS/);
});
test("strict preflight works without .env when deployment variables are injected", () => {
  const result = runPreflight(makeDir("injected-env", null), {
    LUNAVO_PREFLIGHT_TEST_MODE: "1",
    POSTGRES_PASSWORD: testPassword,
    DATABASE_URL: "postgres://lunavo:" + testPassword + "@postgres:5432/lunavo",
    SESSION_SECRET: testSession,
    APP_BASE_URL: "https://lunavo.example.invalid",
    LUNAVO_DOMAIN: "lunavo.example.invalid",
    LUNAVO_MASTER_ADMIN_EMAIL: "ci-admin@example.invalid",
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /Lunavo production preflight: PASS/);
});
test("production preflight rejects reserved placeholder domains", () => {
  const result = runPreflight(makeDir("reserved-domain", validEnvFile), { NODE_ENV: "production" });
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.match(result.stderr, /reserved or placeholder hostname/);
});
test("production preflight rejects reuse of database password as session secret", () => {
  const result = spawnSync(process.execPath, [preflightPath, "--strict", "--public-deploy"], {
    cwd: makeDir("reused-secret", validEnvFile), encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "", NODE_ENV: "production",
      POSTGRES_PASSWORD: testPassword,
      DATABASE_URL: "postgres://lunavo:" + testPassword + "@postgres:5432/lunavo",
      SESSION_SECRET: testPassword,
      APP_BASE_URL: "https://lunavo.example.invalid",
      LUNAVO_DOMAIN: "lunavo.example.invalid",
      LUNAVO_MASTER_ADMIN_EMAIL: "admin@lunavo.example.com",
    },
  });
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.match(result.stderr, /must be different independent secrets/);
});
