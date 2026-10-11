import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import {
  completeLocalVisionJson,
  completePrimaryReasoning,
  getLocalAiPool,
  localAiConfigured,
  localAiPoolSummary,
} from "./ai-provider";

const originalUrl = process.env.LUNAVO_LOCAL_LLM_URL;
const originalPool = process.env.LUNAVO_LOCAL_LLM_POOL;
const originalModel = process.env.LUNAVO_LOCAL_LLM_MODEL;

afterEach(() => {
  vi.unstubAllGlobals();
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


test("uses distinct text specialists for an ensemble and a configured critic for judgment", async () => {
  delete process.env.LUNAVO_LOCAL_LLM_URL;
  delete process.env.LUNAVO_LOCAL_LLM_MODEL;
  process.env.LUNAVO_LOCAL_LLM_POOL = JSON.stringify([
    { id: "vision", url: "http://vision:8000/v1/chat/completions", model: "vision-model", role: "vision", weight: 100 },
    { id: "coding", url: "http://coding:8000/v1/chat/completions", model: "coding-model", role: "coding", weight: 1 },
    { id: "critic", url: "http://critic:8000/v1/chat/completions", model: "critic-model", role: "critic", weight: 1 },
    { id: "primary", url: "http://primary:8000/v1/chat/completions", model: "primary-model", role: "primary", weight: 1 },
  ]);
  const seenModels: string[] = [];
  vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as {
      model: string;
      messages?: Array<{ content?: string }>;
    };
    seenModels.push(request.model);
    const isJudge = request.messages?.some((message) => message.content?.includes("LOCAL CANDIDATES")) ?? false;
    const content = isJudge ? '{"result":"critic-reviewed"}' : '{"result":"candidate"}';
    return new Response(JSON.stringify({
      model: request.model,
      choices: [{ message: { content } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  });

  const result = await completePrimaryReasoning(
    [{ role: "user", content: "Recommend evidence-backed product opportunities." }],
    { json: true, reasoningEffort: "high" },
  );

  assert.ok(seenModels.includes("primary-model"));
  assert.ok(seenModels.includes("critic-model"));
  assert.ok(seenModels.includes("coding-model"));
  assert.ok(!seenModels.includes("vision-model"));
  assert.match(result.model, /local consensus/);
  assert.equal(result.content, '{"result":"critic-reviewed"}');
});

test("does not silently route image understanding to a tagged text-only pool", async () => {
  delete process.env.LUNAVO_LOCAL_LLM_URL;
  process.env.LUNAVO_LOCAL_LLM_POOL = JSON.stringify([
    { id: "primary", url: "http://primary:8000/v1/chat/completions", model: "primary-model", role: "primary", weight: 2 },
    { id: "critic", url: "http://critic:8000/v1/chat/completions", model: "critic-model", role: "critic", weight: 1 },
  ]);

  await assert.rejects(
    () => completeLocalVisionJson("Describe only visible product attributes.", "https://images.example/product.png"),
    /No compatible self-hosted vision model is configured/,
  );
});
