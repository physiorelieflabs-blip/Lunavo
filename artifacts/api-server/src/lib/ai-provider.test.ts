import { afterEach, describe, expect, it } from "vitest";
import { resolveLunavoBrainRoute, runWithLocalProfileFallback, selectLunavoBrainRoles, selectSafeBrainFallback } from "./ai-provider";

const routeEnvKeys = [
  "LUNAVO_LOCAL_AI_ROLE_FINANCE_MODEL",
  "LUNAVO_LOCAL_AI_ROLE_FINANCE_URL",
  "LUNAVO_LOCAL_AI_ARBITER_MODEL",
  "LUNAVO_LOCAL_AI_ARBITER_URL",
] as const;
const originalRouteEnv = Object.fromEntries(routeEnvKeys.map((key) => [key, process.env[key]]));
afterEach(() => {
  for (const key of routeEnvKeys) {
    const original = originalRouteEnv[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe("Lunavo specialist orchestration", () => {
  it("allows a finance specialist to use a separately hosted private model endpoint", () => {
    process.env.LUNAVO_LOCAL_AI_ROLE_FINANCE_MODEL = "qwen3:14b-finance";
    process.env.LUNAVO_LOCAL_AI_ROLE_FINANCE_URL = "http://finance-llm:11434/v1";

    expect(resolveLunavoBrainRoute("finance", "reasoning")).toEqual({
      profile: "reasoning",
      model: "qwen3:14b-finance",
      endpoint: "http://finance-llm:11434/v1",
    });
  });

  it("supports a dedicated arbiter and rejects malformed model identifiers", () => {
    process.env.LUNAVO_LOCAL_AI_ARBITER_MODEL = "deepseek-r1:32b";
    process.env.LUNAVO_LOCAL_AI_ARBITER_URL = "http://arbiter:11434/v1/chat/completions";
    expect(resolveLunavoBrainRoute("arbiter", "reasoning")).toEqual({
      profile: "reasoning",
      model: "deepseek-r1:32b",
      endpoint: "http://arbiter:11434/v1/chat/completions",
    });

    process.env.LUNAVO_LOCAL_AI_ROLE_FINANCE_MODEL = "bad model name";
    expect(() => resolveLunavoBrainRoute("finance", "reasoning")).toThrow(/model identifier/i);
  });

  it("falls back to a second local model when a configured model is unavailable", async () => {
    const attempted: string[] = [];
    const result = await runWithLocalProfileFallback(["reasoning", "general", "review"], async (profile) => {
      attempted.push(profile);
      if (profile === "reasoning") throw new Error('Self-hosted AI [reasoning/deepseek-r1] failed: model "deepseek-r1" not found');
      return "local answer";
    });
    expect(attempted).toEqual(["reasoning", "general"]);
    expect(result.profile).toBe("general");
    expect(result.value).toBe("local answer");
    expect(result.fallbacksUsed).toEqual(["reasoning"]);
  });

  it("does not multiply inference attempts when the bounded queue is full", async () => {
    const attempted: string[] = [];
    await expect(runWithLocalProfileFallback(["fast", "general"], async (profile) => {
      attempted.push(profile);
      throw new Error("Self-hosted AI queue is full");
    })).rejects.toThrow(/queue is full/i);
    expect(attempted).toEqual(["fast"]);
  });
  it("keeps cross-domain specialists including finance and the independent reviewer", () => {
    expect(selectLunavoBrainRoles([
      "researcher",
      "merchandiser",
      "growth",
      "operations",
      "customer",
      "finance",
      "reviewer",
    ])).toEqual([
      "researcher",
      "merchandiser",
      "growth",
      "operations",
      "customer",
      "finance",
      "reviewer",
    ]);
  });

  it("bounds the plan and preserves the reviewer even when it is listed last", () => {
    const roles = selectLunavoBrainRoles([
      "orchestrator",
      "researcher",
      "merchandiser",
      "growth",
      "operations",
      "customer",
      "creative",
      "coder",
      "finance",
      "reviewer",
    ]);
    expect(roles).toHaveLength(7);
    expect(roles).toContain("reviewer");
    expect(new Set(roles).size).toBe(roles.length);
  });

  it("filters invalid runtime role values without inventing roles", () => {
    expect(selectLunavoBrainRoles(["researcher", "not-a-role" as never, "reviewer"])).toEqual([
      "researcher",
      "reviewer",
    ]);
  });

  it("keeps finance and reviewer when both fall beyond the normal specialist window", () => {
    const roles = selectLunavoBrainRoles([
      "orchestrator", "researcher", "merchandiser", "growth", "operations", "customer", "creative", "coder", "finance", "reviewer",
    ]);
    expect(roles).toHaveLength(7);
    expect(roles).toContain("finance");
    expect(roles).toContain("reviewer");
  });

  it("chooses reviewer or finance over a research draft if final arbitration is unavailable", () => {
    const successes = [
      { role: "researcher" as const, response: "research" },
      { role: "finance" as const, response: "finance" },
      { role: "reviewer" as const, response: "review" },
    ];
    expect(selectSafeBrainFallback(successes)?.response).toBe("review");
    expect(selectSafeBrainFallback(successes.filter((item) => item.role !== "reviewer"))?.response).toBe("finance");
    expect(selectSafeBrainFallback([])).toBeNull();
  });

});
