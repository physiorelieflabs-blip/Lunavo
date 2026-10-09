import { afterEach, describe, expect, it } from "vitest";
import { resolveLocalAiProfile, selfHostedAiQueueState } from "./self-hosted-ai";

const original = {
  LUNAVO_LOCAL_LLM_URL: process.env.LUNAVO_LOCAL_LLM_URL,
  LUNAVO_LOCAL_AI_BASE_URL: process.env.LUNAVO_LOCAL_AI_BASE_URL,
  LUNAVO_LOCAL_AI_FAST_URL: process.env.LUNAVO_LOCAL_AI_FAST_URL,
  LUNAVO_LOCAL_AI_MAX_PARALLEL: process.env.LUNAVO_LOCAL_AI_MAX_PARALLEL,
};

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("self-hosted AI endpoint boundary", () => {
  it("accepts loopback, private-network and Docker-local endpoints", () => {
    for (const value of [
      "http://127.0.0.1:11434/v1/chat/completions",
      "http://192.168.1.50:11434/v1/chat/completions",
      "http://ollama:11434/v1/chat/completions",
      "http://host.docker.internal:11434/v1/chat/completions",
    ]) {
      process.env.LUNAVO_LOCAL_LLM_URL = value;
      expect(resolveLocalAiProfile("general").url).toBe(value);
    }
  });

  it("rejects public cloud endpoints for the local AI slot", () => {
    process.env.LUNAVO_LOCAL_LLM_URL = "https://example.com/v1/chat/completions";
    expect(() => resolveLocalAiProfile("general")).toThrow(/private\/local/i);
  });

  it("applies the same policy to profile-specific endpoints", () => {
    delete process.env.LUNAVO_LOCAL_LLM_URL;
    delete process.env.LUNAVO_LOCAL_AI_BASE_URL;
    process.env.LUNAVO_LOCAL_AI_FAST_URL = "https://example.com/v1/chat/completions";
    expect(() => resolveLocalAiProfile("fast")).toThrow(/private\/local/i);
  });

  it("bounds configured inference concurrency and falls back safely", () => {
    process.env.LUNAVO_LOCAL_AI_MAX_PARALLEL = "3";
    expect(selfHostedAiQueueState()).toMatchObject({ maxParallel: 3, inFlight: 0, queued: 0 });
    process.env.LUNAVO_LOCAL_AI_MAX_PARALLEL = "100";
    expect(selfHostedAiQueueState().maxParallel).toBe(8);
    process.env.LUNAVO_LOCAL_AI_MAX_PARALLEL = "0";
    expect(selfHostedAiQueueState().maxParallel).toBe(2);
  });
});
