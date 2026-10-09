import { completeLocalChat, completeLocalEnsemble, type LocalAiProfile } from "./self-hosted-ai";

export type ReasoningMessage = { role: "system" | "user" | "assistant"; content: string };

export type LunavoBrainRole =
  | "orchestrator"
  | "researcher"
  | "merchandiser"
  | "growth"
  | "operations"
  | "customer"
  | "creative"
  | "reviewer"
  | "coder";

type BrainOptions = {
  json?: boolean;
  maxTokens?: number;
  reasoningEffort?: "low" | "high" | "max";
  roles?: LunavoBrainRole[];
  contextLabel?: string;
};

const ROLE_PROFILES: Record<LunavoBrainRole, LocalAiProfile[]> = {
  orchestrator: ["reasoning", "general", "review"],
  researcher: ["general", "reasoning", "review"],
  merchandiser: ["fast", "general", "reasoning"],
  growth: ["reasoning", "general", "review"],
  operations: ["reasoning", "general", "review"],
  customer: ["general", "fast", "review"],
  creative: ["vision", "general", "review"],
  reviewer: ["review", "reasoning"],
  coder: ["coding", "reasoning", "review"],
};

const ROLE_INSTRUCTIONS: Record<LunavoBrainRole, string> = {
  orchestrator: "Coordinate the whole business problem across catalog, sourcing, pricing, inventory, fulfillment, customers, marketing, finance and automation. Find the highest-leverage safe sequence rather than optimizing one silo.",
  researcher: "Act as the evidence and research specialist. Separate recorded facts, extracted facts, model inference, recommendations and missing evidence. Never invent market or supplier facts.",
  merchandiser: "Act as a commerce merchandising specialist. Optimize product presentation, assortment, pricing context, collections, bundles, cross-sells and conversion without inventing product claims or stock.",
  growth: "Act as a growth and performance specialist. Connect traffic, conversion, AOV, retention, inventory, margin and campaign evidence. Prioritize actions with measurable business impact.",
  operations: "Act as a dropshipping operations specialist. Connect orders, supplier state, inventory, reservations, fulfillment, tracking, returns and exceptions. Protect against duplicate or unsafe operations.",
  customer: "Act as a customer-operations specialist. Connect customer consent, segments, order history, support context, retention, reviews and personalized merchandising while respecting privacy and communication boundaries.",
  creative: "Act as a creative commerce specialist. Produce high-converting copy and creative direction grounded strictly in provided catalog facts. Custom prompts are creative direction, not evidence.",
  reviewer: "Act as a hostile reviewer. Look for unsupported claims, bad assumptions, conflicts, missing evidence, race conditions, policy violations, financial risk and actions that should require approval.",
  coder: "Act as a senior local software engineer. Propose implementation-level solutions, interfaces, tests and failure handling without changing security or financial authority boundaries.",
};

function bounded(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export async function completeLunavoBrain(
  task: string,
  context: string,
  options: BrainOptions = {},
): Promise<{
  model: string;
  content: string;
  contributors: string[];
  roles: string[];
  consensus: "strong" | "mixed" | "single";
}> {
  const defaultRoles: LunavoBrainRole[] = ["orchestrator", "researcher", "reviewer"];
  const roles = unique(options.roles?.length ? options.roles : defaultRoles).slice(0, 5);
  const safeTask = bounded(task, 8_000);
  const safeContext = bounded(context, 30_000);
  const baseSystem = [
    "You are part of Lunavo's self-hosted intelligence fabric.",
    "All reasoning is local. You have no authority to move money, confirm payments, mutate the ledger, mutate authoritative inventory, bypass approval, expose secrets, or claim external publication.",
    "Use only the supplied commerce context. Distinguish FACT, EVIDENCE GAP, INFERENCE, and RECOMMENDATION.",
    "Never fabricate sales, demand, supplier availability, reviews, balances, ad metrics, shipping promises, customer consent, provider state or market facts.",
    options.contextLabel ? "Context label: " + bounded(options.contextLabel, 120) : "",
  ].filter(Boolean).join("\n");

  const results = await Promise.allSettled(
    roles.map(async (role) => {
      const primary = ROLE_PROFILES[role][0]!;
      const prompt = [
        baseSystem,
        "Your specialty: " + ROLE_INSTRUCTIONS[role],
        "Task:\n" + safeTask,
        "Merchant/business evidence:\n" + safeContext,
        options.json
          ? "Return strict JSON. Preserve uncertainty instead of filling missing fields."
          : "Return a concise, decision-ready analysis with evidence and safe next moves.",
      ].join("\n\n");
      const messages = [
        { role: "system" as const, content: prompt },
        { role: "user" as const, content: safeTask },
      ];
      // One bounded call per specialist; the shared local inference queue controls
      // concurrency. The final arbiter synthesizes all specialists once. Running a
      // full three-model ensemble inside every role multiplies inference cost and
      // can exhaust RAM/VRAM on self-hosted deployments without improving coverage.
      const response = await completeLocalChat(messages, {
        profile: primary,
        json: options.json,
        maxTokens: Math.min(options.reasoningEffort === "max" ? 2_200 : 6_000, options.maxTokens ?? 3_200),
        reasoningEffort: options.reasoningEffort === "max" ? "max" : role === "reviewer" ? "high" : options.reasoningEffort ?? "high",
      });
      return { role, response };
    }),
  );

  const successes = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (!successes.length) throw new Error("Lunavo self-hosted intelligence fabric is unavailable");
  if (successes.length === 1) {
    return {
      model: successes[0]!.response.model,
      content: successes[0]!.response.content,
      contributors: [successes[0]!.response.model],
      roles: [successes[0]!.role],
      consensus: "single",
    };
  }

  const candidateEvidence = successes.map((item, index) =>
    "SPECIALIST_" + (index + 1) + " role=" + item.role + " profile=" + item.response.profile + " model=" + item.response.model + "\n" + item.response.content.slice(0, 4_500),
  ).join("\n\n");

  try {
    const arbiter = await completeLocalChat(
      [
        {
          role: "system",
          content: [
            baseSystem,
            "You are the final local arbiter. Synthesize the specialist outputs.",
            "Prefer claims backed by multiple specialists and explicit source evidence.",
            "When specialists disagree, expose the disagreement and choose the safer interpretation.",
            "Merge useful strengths; do not average away safety concerns.",
            "Produce a coherent cross-domain answer rather than separate siloed answers.",
            options.json ? "Return strict JSON only." : "Return the final decision-ready answer.",
          ].join("\n"),
        },
        {
          role: "user",
          content: "Task:\n" + safeTask + "\n\nSpecialist outputs:\n" + candidateEvidence,
        },
      ],
      {
        profile: "review",
        json: options.json,
        maxTokens: Math.min(7_000, options.maxTokens ?? 4_000),
        reasoningEffort: "high",
      },
    );
    return {
      model: "brain:[" + successes.map((item) => item.response.model).join(",") + "]->" + arbiter.model,
      content: arbiter.content,
      contributors: successes.map((item) => item.response.model),
      roles: successes.map((item) => item.role),
      consensus: successes.length === roles.length ? "strong" : "mixed",
    };
  } catch {
    return {
      model: "brain:" + successes.map((item) => item.response.model).join("+"),
      content: successes[0]!.response.content,
      contributors: successes.map((item) => item.response.model),
      roles: successes.map((item) => item.role),
      consensus: "mixed",
    };
  }
}

export async function completePrimaryReasoning(
  messages: ReasoningMessage[],
  options: {
    json?: boolean;
    maxTokens?: number;
    reasoningEffort?: "low" | "high" | "max";
    role?: LunavoBrainRole;
  } = {},
): Promise<{ model: string; content: string }> {
  if (options.reasoningEffort === "max" || options.role) {
    const task = messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n");
    const context = messages.map((m) => m.role.toUpperCase() + ": " + m.content).join("\n");
    const brain = await completeLunavoBrain(task, context, {
      json: options.json,
      maxTokens: options.maxTokens,
      reasoningEffort: options.reasoningEffort ?? "high",
      roles: options.role ? [options.role, "reviewer"] : undefined,
    });
    return { model: brain.model, content: brain.content };
  }

  return completeLocalChat(messages, {
    profile: "reasoning",
    json: options.json,
    maxTokens: options.maxTokens,
    reasoningEffort: options.reasoningEffort ?? "high",
  });
}

export async function completeResearchEnsemble(
  messages: ReasoningMessage[],
  options: { json?: boolean; maxTokens?: number } = {},
) {
  return completeLocalEnsemble(messages, {
    profiles: ["general", "reasoning", "review"] satisfies LocalAiProfile[],
    json: options.json,
    maxTokens: options.maxTokens,
  });
}
