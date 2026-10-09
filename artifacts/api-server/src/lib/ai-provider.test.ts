import { describe, expect, it } from "vitest";
import { selectLunavoBrainRoles } from "./ai-provider";

describe("Lunavo specialist orchestration", () => {
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
