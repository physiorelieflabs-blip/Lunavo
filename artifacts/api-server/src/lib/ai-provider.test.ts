import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { getLocalAiPool, localAiConfigured, localAiPoolSummary } from "./ai-provider";

const originalUrl = process.env.LUNAVO_LOCAL_LLM_URL;
const originalPool = process.env.LUNAVO_LOCAL_LLM_POOL;
const originalModel = process.env.LUNAVO_LOCAL_LLM_MODEL;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.LUNAVO_LOCAL_LLM_URL;
  else process.env.LUNAVO_LOCAL_LLM_URL = originalUrl;
  if (originalPool === undefined) delete process.env.LUNAVO_LOCAL_LLM_POOL;
  else process.env.LUNAVO_LOCAL_LLM_POOL = originalPool;
  if (originalModel === undefined) delete process.env.LUNAVO_LOCAL_LLM_MODEL;
  else process.env.LUNAVO_LOCAL_LLM_MODEL = originalModel;
});

test("falls back to one configured local LLM endpoint", async () => {
  delete process.env.LUNAVO_LOCAL_LLM_POOL;
  process.env.LUNAVO_LOCAL_LLM_URL = "http://llm:8000/v1/chat/completions";
  process.env.LUNAVO_LOCAL_LLM_MODEL = "local-reasoner";
  const pool = await getLocalAiPool();
  assert.equal(pool.length, 1);
  assert.equal(pool[0]?.id, "default");
  assert.equal(pool[0]?.model, "local-reasoner");
  assert.equal(localAiConfigured(), true);
});

test("parses and orders a bounded self-hosted ensemble", async () => {
  delete process.env.LUNAVO_LOCAL_LLM_URL;
  process.env.LUNAVO_LOCAL_LLM_POOL = JSON.stringify([
    { id: "critic", url: "http://critic:8000/v1/chat/completions", model: "critic-model", role: "critic", weight: 1 },
    { id: "reasoner", url: "http://reasoner:8000/v1/chat/completions", model: "reasoner-model", role: "primary", weight: 3 },
  ]);
  const pool = await getLocalAiPool();
  assert.deepEqual(pool.map((x) => x.id), ["critic", "reasoner"]);
  assert.deepEqual(localAiPoolSummary().map((x) => x.model), ["critic-model", "reasoner-model"]);
});

test("rejects malformed or oversized local pools", async () => {
  delete process.env.LUNAVO_LOCAL_LLM_URL;
  process.env.LUNAVO_LOCAL_LLM_POOL = "{";
  await assert.rejects(() => getLocalAiPool(), /valid JSON/);
  process.env.LUNAVO_LOCAL_LLM_POOL = JSON.stringify([
    { url: "http://a:8000" }, { url: "http://b:8000" }, { url: "http://c:8000" },
    { url: "http://d:8000" }, { url: "http://e:8000" },
  ]);
  await assert.rejects(() => getLocalAiPool(), /1 to 4/);
});
