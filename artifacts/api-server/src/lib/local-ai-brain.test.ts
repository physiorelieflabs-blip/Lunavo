import { describe, expect, it, vi } from "vitest";
import { completeLocalBrain } from "./local-ai-brain";

describe("local AI brain", () => {
  it("routes across multiple local OpenAI-compatible candidates and synthesizes when available", async () => {
    process.env.LUNAVO_LOCAL_LLM_URLS = "http://127.0.0.1:9001,http://127.0.0.1:9002";
    process.env.LUNAVO_LOCAL_LLM_MODEL = "model-a";
    process.env.LUNAVO_LOCAL_BRAIN_FANOUT = "2";
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      return new Response(JSON.stringify({
        model: url.includes("9002") ? "model-b" : "model-a",
        choices: [{ message: { content: url.includes("9002") ? "second candidate" : "first candidate" } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const result = await completeLocalBrain([{ role: "user", content: "Decide safely." }], { ensemble: false });
    expect(result.successfulCandidates).toBe(2);
    expect(calls).toHaveLength(2);
    expect(result.content).toBe("first candidate");
    vi.unstubAllGlobals();
  });
});
