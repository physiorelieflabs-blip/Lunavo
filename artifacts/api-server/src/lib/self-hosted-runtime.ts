/**
 * Canonical self-hosted runtime policy for Lunavo.
 *
 * Core intelligence and creative generation are local services. No hosted AI
 * credential is accepted by this layer. Flutterwave is intentionally outside
 * this policy because it is the regulated external payment rail.
 *
 * The model names below are real open-weight models available through local
 * runtimes such as Ollama. They are defaults, not hard-coded claims that the
 * weights are already installed on a deployment.
 */
export const SELF_HOSTED_RUNTIME = {
  intelligence: {
    transport: "OpenAI-compatible local inference",
    baseUrlEnv: "LUNAVO_LOCAL_AI_BASE_URL",
    chatUrlEnv: "LUNAVO_LOCAL_LLM_URL",
    profiles: {
      fast: { model: "qwen3:4b", env: "LUNAVO_LOCAL_AI_FAST_MODEL" },
      general: { model: "qwen3:14b", env: "LUNAVO_LOCAL_AI_GENERAL_MODEL" },
      reasoning: { model: "deepseek-r1:14b", env: "LUNAVO_LOCAL_AI_REASONING_MODEL" },
      coding: { model: "qwen3-coder:30b", env: "LUNAVO_LOCAL_AI_CODING_MODEL" },
      vision: { model: "gemma3:12b", env: "LUNAVO_LOCAL_AI_VISION_MODEL" },
      review: { model: "qwen3:14b", env: "LUNAVO_LOCAL_AI_REVIEW_MODEL" },
    },
    ensemble: {
      enabledByCall: true,
      defaultProfiles: ["general", "reasoning", "review"] as const,
      policy: "parallel candidates followed by a local review/arbiter pass",
    },
  },
  embeddings: {
    provider: "local embedding runtime",
    endpointEnv: "LUNAVO_LOCAL_EMBEDDINGS_URL",
    defaultModel: "nomic-embed-text",
  },
  image: {
    provider: "local-image-worker",
    endpointEnv: "LUNAVO_LOCAL_IMAGE_URL",
    defaultUrl: "http://127.0.0.1:8188",
  },
  video: {
    provider: "local-video-worker",
    endpointEnv: "LUNAVO_LOCAL_VIDEO_URL",
    defaultUrl: "http://127.0.0.1:8189",
  },
  fx: {
    provider: "self-hosted-admin-ratebook",
    endpointEnv: "LUNAVO_LOCAL_FX_URL",
    ratebookEnv: "LUNAVO_FX_RATES_FILE",
    defaultUrl: "http://127.0.0.1:8081/v1/rate",
    noExternalUpstream: true,
  },
  mail: {
    provider: "local-outbox",
    pathEnv: "LUNAVO_LOCAL_OBJECT_STORAGE_PATH",
    noRemoteSmtp: true,
  },
  policy: {
    externalAiKeysRequired: false,
    externalCommerceAiRequired: false,
    externalPaymentRail: "flutterwave",
    externalInfrastructure: "none",
    modelMayMoveMoney: false,
    modelMayConfirmPayment: false,
    modelMayChangeLedger: false,
    modelMayChangeInventory: false,
    modelMayBypassApproval: false,
  },
} as const;

export function assertSelfHostedRuntimePolicy() {
  if (SELF_HOSTED_RUNTIME.policy.externalAiKeysRequired) {
    throw new Error("Lunavo core AI must not require an external AI key");
  }
  if (SELF_HOSTED_RUNTIME.policy.modelMayMoveMoney ||
      SELF_HOSTED_RUNTIME.policy.modelMayConfirmPayment ||
      SELF_HOSTED_RUNTIME.policy.modelMayChangeLedger ||
      SELF_HOSTED_RUNTIME.policy.modelMayChangeInventory ||
      SELF_HOSTED_RUNTIME.policy.modelMayBypassApproval) {
    throw new Error("Lunavo AI policy is unsafe: financial, inventory, or approval authority must remain outside the model");
  }
  return SELF_HOSTED_RUNTIME;
}
