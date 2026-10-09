import { describe, expect, it } from "vitest";
import { runWithLocalProfileFallback, selectLunavoBrainRoles } from "./ai-provider";

describe("Lunavo specialist orchestration", () => {
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
  it("keeps all six cross-domain specialists including the independent reviewer", () => {
    expect(selectLunavoBrainRoles([
      "researcher",
      "merchandiser",
      "growth",
      "operations",
      "customer",
      "reviewer",
    ])).toEqual([
      "researcher",
      "merchandiser",
      "growth",
      "operations",
      "customer",
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
      "reviewer",
    ]);
    expect(roles).toHaveLength(6);
    expect(roles).toContain("reviewer");
    expect(new Set(roles).size).toBe(roles.length);
  });

  it("filters invalid runtime role values without inventing roles", () => {
    expect(selectLunavoBrainRoles(["researcher", "not-a-role" as never, "reviewer"])).toEqual([
      "researcher",
      "reviewer",
    ]);
  });
});
