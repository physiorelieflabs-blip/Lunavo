type ModelsLabResponse = {
  status?: "success" | "processing" | "error" | string;
  output?: unknown;
  id?: number | string;
  fetch_result?: string;
  message?: string;
  messege?: string;
};

const MODELSLAB_API_BASE = "https://modelslab.com/api/v6";
const MODELSLAB_MODEL = "sdxl";

function modelsLabKey(): string {
  const key = process.env.STABLE_DIFFUSION_API_KEY?.trim();
  if (!key) throw new Error("STABLE_DIFFUSION_API_KEY is not configured");
  return key;
}

async function requestModelsLab(
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<ModelsLabResponse> {
  const response = await fetch(`${MODELSLAB_API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = (await response.json().catch(() => ({}))) as ModelsLabResponse;
  const providerMessage = payload.message || payload.messege;
  if (!response.ok || payload.status === "error") {
    throw new Error(providerMessage || `ModelsLab returned HTTP ${response.status}`);
  }
  return payload;
}

function imageUrlFromResponse(payload: ModelsLabResponse): string | null {
  if (typeof payload.output === "string") return payload.output;
  if (Array.isArray(payload.output)) {
    const firstUrl = payload.output.find((item): item is string => typeof item === "string");
    if (firstUrl) return firstUrl;
  }
  return null;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function resolveImageUrl(prompt: string): Promise<string> {
  const key = modelsLabKey();
  const initial = await requestModelsLab("/images/text2img", {
    key,
    prompt,
    model_id: MODELSLAB_MODEL,
    width: 768,
    height: 768,
    samples: 1,
    num_inference_steps: 30,
    guidance_scale: 7.5,
    safety_checker: "yes",
  }, 120_000);
  const immediateUrl = imageUrlFromResponse(initial);
  if (immediateUrl) return immediateUrl;
  if (initial.status !== "processing" || initial.id === undefined) {
    throw new Error(initial.message || initial.messege || "ModelsLab returned no image");
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await wait(2_000);
    const result = await requestModelsLab(`/images/fetch/${encodeURIComponent(String(initial.id))}`, { key }, 30_000);
    const imageUrl = imageUrlFromResponse(result);
    if (imageUrl) return imageUrl;
    if (result.status === "error") {
      throw new Error(result.message || result.messege || "ModelsLab image generation failed");
    }
  }
  throw new Error("ModelsLab image generation timed out while waiting for the result");
}

export async function generateModelsLabImage(prompt: string): Promise<{
  model: string;
  mimeType: string;
  data: string;
  bytes: Buffer;
}> {
  const imageUrl = await resolveImageUrl(prompt);
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`ModelsLab image download returned HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("ModelsLab returned an empty image");
  const responseType = response.headers.get("content-type")?.split(";")[0].trim();
  const mimeType = responseType?.startsWith("image/") ? responseType : "image/png";
  const encoded = bytes.toString("base64");
  return {
    model: `modelslab:${MODELSLAB_MODEL}`,
    mimeType,
    data: `data:${mimeType};base64,${encoded}`,
    bytes,
  };
}