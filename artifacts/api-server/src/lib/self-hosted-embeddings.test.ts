import assert from "node:assert/strict";
import { afterEach, beforeEach, it as test } from "vitest";
import { embedLocal, embeddingsConfigured } from "./self-hosted-embeddings";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.LUNAVO_LOCAL_EMBEDDINGS_URL = "http://127.0.0.1:11434/v1/embeddings";
  process.env.LUNAVO_LOCAL_EMBEDDINGS_MODEL = "nomic-embed-text";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

test("embedding adapter validates a local vector and sends no external credential", async () => {
  let request: RequestInit | undefined;
  globalThis.fetch = (async (_input, init) => {
    request = init;
    return new Response(JSON.stringify({
      model: "nomic-embed-text",
      data: [{ embedding: [0.1, -0.2, 0.3] }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const result = await embedLocal("catalog text");
  assert.equal(result.model, "nomic-embed-text");
  assert.deepEqual(result.embedding, [0.1, -0.2, 0.3]);
  const headers = new Headers(request?.headers);
  assert.equal(headers.get("authorization"), null);
  assert.equal(headers.get("x-api-key"), null);
  assert.equal(embeddingsConfigured(), true);
});

test("embedding adapter rejects malformed vectors", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    model: "nomic-embed-text",
    data: [{ embedding: [0.1, Number.NaN] }],
  }), { status: 200 })) as typeof fetch;
  await assert.rejects(() => embedLocal("bad"), /failed validation/);
});
