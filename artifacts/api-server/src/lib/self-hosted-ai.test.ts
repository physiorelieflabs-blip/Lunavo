import assert from "node:assert/strict";
import { afterEach, beforeEach, it as test } from "vitest";
import {
  completeLocalChat,
  completeLocalEnsemble,
  configuredSelfHostedProfiles,
  resolveLocalAiProfile,
  selfHostedAiConfigured,
} from "./self-hosted-ai";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.LUNAVO_LOCAL_LLM_URL = "http://127.0.0.1:11434/v1/chat/completions";
  process.env.LUNAVO_LOCAL_AI_BASE_URL = "http://127.0.0.1:11434/v1";
  process.env.LUNAVO_LOCAL_AI_FAST_MODEL = "qwen3:4b";
  process.env.LUNAVO_LOCAL_AI_GENERAL_MODEL = "qwen3:14b";
  process.env.LUNAVO_LOCAL_AI_REASONING_MODEL = "deepseek-r1:14b";
  process.env.LUNAVO_LOCAL_AI_CODING_MODEL = "qwen3-coder:30b";
  process.env.LUNAVO_LOCAL_AI_VISION_MODEL = "gemma3:12b";
  process.env.LUNAVO_LOCAL_AI_REVIEW_MODEL = "qwen3:14b";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

test("resolves specialist local model profiles without external API keys", () => {
  assert.equal(resolveLocalAiProfile("fast").model, "qwen3:4b");
  assert.equal(resolveLocalAiProfile("reasoning").model, "deepseek-r1:14b");
  assert.equal(resolveLocalAiProfile("coding").model, "qwen3-coder:30b");
  assert.equal(resolveLocalAiProfile("vision").model, "gemma3:12b");
  assert.equal(selfHostedAiConfigured(), true);
  assert.deepEqual(configuredSelfHostedProfiles().map((item) => item.profile), [
    "fast", "general", "reasoning", "coding", "vision", "review",
  ]);
});

test("uses the selected local profile and never adds an API key", async () => {
  let request: RequestInit | undefined;
  globalThis.fetch = (async (_input, init) => {
    request = init;
    return new Response(JSON.stringify({
      model: "qwen3:4b",
      choices: [{ message: { content: "local answer" } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const result = await completeLocalChat(
    [{ role: "user", content: "hello" }],
    { profile: "fast", maxTokens: 100 },
  );

  assert.equal(result.model, "qwen3:4b");
  assert.equal(result.content, "local answer");
  const headers = new Headers(request?.headers);
  assert.equal(headers.get("authorization"), null);
  assert.equal(headers.get("x-api-key"), null);
  assert.match(String(request?.body), /"model":"qwen3:4b"/);
});

test("ensemble combines multiple local specialists and falls back safely", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (_input, init) => {
    const payload = JSON.parse(String(init?.body));
    const model = payload.model as string;
    calls.push(model);
    const answer = model === "deepseek-r1:14b"
      ? "reasoning answer"
      : model === "qwen3:14b"
        ? "general answer"
        : "review answer";
    return new Response(JSON.stringify({
      model,
      choices: [{ message: { content: answer } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const result = await completeLocalEnsemble(
    [{ role: "user", content: "Decide carefully." }],
    { profiles: ["general", "reasoning"] },
  );

  assert.equal(result.consensus, "strong");
  assert.deepEqual(result.contributors.sort(), ["deepseek-r1:14b", "qwen3:14b"].sort());
  assert.equal(calls.filter((model) => model === "deepseek-r1:14b").length, 1);
  assert.equal(calls.filter((model) => model === "qwen3:14b").length, 1);
});
