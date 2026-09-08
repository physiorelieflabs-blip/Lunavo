/**
 * Canonical self-hosted runtime policy for TS Commerce.
 *
 * Core intelligence and creative generation are local services. No hosted AI
 * credential is accepted by this layer. Flutterwave is intentionally outside
 * this policy because it is the regulated external payment rail.
 */
export const SELF_HOSTED_RUNTIME = {
  language: {
    provider: "local-openai-compatible",
    baseUrlEnv: "LUNAVO_LOCAL_AI_BASE_URL",
    modelEnv: "LUNAVO_LOCAL_AI_MODEL",
    defaultModel: "deepseek-r1:14b",
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
  policy: {
    externalAiKeysRequired: false,
    externalCommerceAiRequired: false,
    externalPaymentRail: "flutterwave",
    modelMayMoveMoney: false,
    modelMayConfirmPayment: false,
    modelMayChangeLedger: false,
    modelMayBypassApproval: false,
  },
} as const;

export function assertSelfHostedRuntimePolicy() {
  if (SELF_HOSTED_RUNTIME.policy.externalAiKeysRequired) {
    throw new Error("TS Commerce core AI must not require an external AI key");
  }
  return SELF_HOSTED_RUNTIME;
}
