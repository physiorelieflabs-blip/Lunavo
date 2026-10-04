import { afterEach, describe, expect, it, vi } from "vitest";
import { completeLocalBrain } from "./local-ai-brain";

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of [
    "LUNAVO_LOCAL_LLM_URLS",
    "LUNAVO_LOCAL_LLM_MODEL",
    "LUNAVO_LOCAL_BRAIN_FANOUT",
    "LUNAVO_LOCAL_CRITIC_URLS",
    "LUNAVO_LOCAL_CRITIC_MODEL",
  ]) {
    delete process.env[key];
  }
});

describe("local AI brain", () => {
  it("fans out across multiple local candidates when ensemble mode is enabled", async () => {
    process.env.LUNAVO_LOCAL_LLM_URLS = "http://127.0.0.1:9001,http://127.0.0.1:9002";
    process.env.LUNAVO_LOCAL_LLM_MODEL = "model-a";
    process.env.LUNAVO_LOCAL_BRAIN_FANOUT = "2";
    process.env.LUNAVO_LOCAL_CRITIC_URLS = "http://127.0.0.1:9010";
    process.env.LUNAVO_LOCAL_CRITIC_MODEL = "critic-a";

    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      const isCritic = url.includes("9010");
      const content = isCritic
        ? "synthesized answer"
        : url.includes("9002")
          ? "second candidate"
          : "first candidate";
      return new Response(JSON.stringify({
        model: isCritic ? "critic-a" : url.includes("9002") ? "model-b" : "model-a",
        choices: [{ message: { content } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const result = await completeLocalBrain(
      [{ role: "user", content: "Decide safely." }],
      { ensemble: true },
    );

    expect(result.successfulCandidates).toBe(2);
    expect(result.candidatesTried).toBe(2);
    expect(calls).toHaveLength(3);
    expect(calls.filter((url) => url.includes("9001") || url.includes("9002"))).toHaveLength(2);
    expect(calls.filter((url) => url.includes("9010"))).toHaveLength(1);
    expect(result.content).toBe("synthesized answer");
  });


  it("can ensemble multiple self-hosted models behind one endpoint", async () => {
    process.env.LUNAVO_LOCAL_LLM_URLS = "http://127.0.0.1:9003";
    process.env.LUNAVO_LOCAL_REASONING_MODELS = "model-a,model-b";
    process.env.LUNAVO_LOCAL_BRAIN_FANOUT = "2";

    const calls: Array<{ url: string; model: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      calls.push({ url, model: String(body.model) });
      return new Response(JSON.stringify({
        model: body.model,
        choices: [{ message: { content: String(body.model) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const result = await completeLocalBrain(
      [{ role: "user", content: "Compare models." }],
      { ensemble: true },
    );

    expect(result.successfulCandidates).toBe(2);
    expect(result.candidatesTried).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls.map((entry) => entry.model)).toEqual(["model-a", "model-b"]);
  });

  it("disables fanout when ensemble mode is explicitly disabled", async () => {
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

    const result = await completeLocalBrain(
      [{ role: "user", content: "Decide safely." }],
      { ensemble: false },
    );

    expect(result.successfulCandidates).toBe(1);
    expect(result.candidatesTried).toBe(1);
    expect(calls).toHaveLength(1);
    expect(result.content).toBe("first candidate");
  });
});
