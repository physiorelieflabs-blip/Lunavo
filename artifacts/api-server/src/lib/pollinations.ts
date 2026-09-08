const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3.1-flash-image";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const STABILITY_IMAGE_MODEL = "stable-image/generate/core";
const STABILITY_IMAGE_URL = `https://api.stability.ai/v2beta/${STABILITY_IMAGE_MODEL}`;

type GeminiImageResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          data?: string;
          mimeType?: string;
        };
      }>;
    };
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    message?: string;
  };
};

function apiKey(name: "GEMINI_IMAGE_API_KEY" | "GEMINI_API_KEY" | "STABLE_DIFFUSION_API_KEY"): string | null {
  return process.env[name]?.trim() || null;
}

type GeneratedImage = {
  model: string;
  mimeType: string;
  data: string;
  bytes: Buffer;
};

async function generateGeminiImage(prompt: string, key: string): Promise<GeneratedImage> {
  // Prefer the Gemini Interactions API for the current Nano Banana 2 image model.
  const interactionResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      model: GEMINI_IMAGE_MODEL,
      input: prompt,
      response_format: {
        type: "image",
        aspect_ratio: "1:1",
        image_size: "2K",
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const interactionPayload = (await interactionResponse.json().catch(() => ({}))) as Record<string, unknown>;
  if (interactionResponse.ok) {
    const outputImage = interactionPayload.output_image;
    if (outputImage && typeof outputImage === "object") {
      const image = outputImage as Record<string, unknown>;
      const data = typeof image.data === "string" ? image.data : "";
      const mimeType = typeof image.mime_type === "string" ? image.mime_type : "image/png";
      if (data && mimeType.startsWith("image/")) {
        const bytes = Buffer.from(data, "base64");
        if (bytes.length) {
          return {
            model: `gemini:${GEMINI_IMAGE_MODEL}`,
            mimeType,
            data: `data:${mimeType};base64,${data}`,
            bytes,
          };
        }
      }
    }
    const steps = Array.isArray(interactionPayload.steps) ? interactionPayload.steps : [];
    for (const step of steps) {
      if (!step || typeof step !== "object") continue;
      const content = (step as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const candidate = block as Record<string, unknown>;
        if (candidate.type !== "image") continue;
        const data = typeof candidate.data === "string" ? candidate.data : "";
        const mimeType = typeof candidate.mime_type === "string" ? candidate.mime_type : "image/png";
        if (!data || !mimeType.startsWith("image/")) continue;
        const bytes = Buffer.from(data, "base64");
        if (!bytes.length) continue;
        return {
          model: `gemini:${GEMINI_IMAGE_MODEL}`,
          mimeType,
          data: `data:${mimeType};base64,${data}`,
          bytes,
        };
      }
    }
  }

  // Backward-compatible GenerateContent fallback for Gemini API configurations
  // that have not exposed the Interactions endpoint to the project yet.
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{
            text: [
              "Generate exactly one image that follows the user's brief precisely.",
              "Prioritize realistic ecommerce composition, material fidelity, coherent lighting, and clean commercial presentation.",
              "USER IMAGE BRIEF:",
              prompt,
            ].join("\n"),
          }],
        }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageSize: "2K",
        },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as GeminiImageResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || (interactionResponse.ok ? `Gemini returned HTTP ${response.status}` : `Gemini returned HTTP ${interactionResponse.status}`));
  }

  const candidate = payload.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part) => part.inlineData?.data && part.inlineData.mimeType?.startsWith("image/"),
  );
  if (!imagePart?.inlineData?.data) {
    const reason = payload.promptFeedback?.blockReason || candidate?.finishReason;
    throw new Error(reason ? `Gemini did not return an image (${reason})` : "Gemini returned no image data");
  }

  const mimeType = imagePart.inlineData.mimeType || "image/png";
  const bytes = Buffer.from(imagePart.inlineData.data, "base64");
  if (!bytes.length) throw new Error("Gemini returned an empty image");
  return {
    model: `gemini:${GEMINI_IMAGE_MODEL}`,
    mimeType,
    data: `data:${mimeType};base64,${imagePart.inlineData.data}`,
    bytes,
  };
}

async function generateStabilityImage(prompt: string, key: string): Promise<GeneratedImage> {
  const body = new FormData();
  body.set("prompt", prompt);
  body.set("output_format", "png");
  body.set("aspect_ratio", "1:1");

  const response = await fetch(STABILITY_IMAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "image/*",
    },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  const mimeType = response.headers.get("content-type")?.split(";")[0].trim() || "image/png";
  if (!response.ok) {
    const providerMessage = await response.text().catch(() => "");
    throw new Error(providerMessage.slice(0, 300) || `Stability returned HTTP ${response.status}`);
  }
  if (!mimeType.startsWith("image/")) {
    throw new Error("Stability returned a non-image response");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Stability returned an empty image");
  const encoded = bytes.toString("base64");
  return {
    model: "stability:stable-image/core",
    mimeType,
    data: `data:${mimeType};base64,${encoded}`,
    bytes,
  };
}

async function generatePollinationsImage(prompt: string): Promise<GeneratedImage> {
  const imageUrl = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`);
  imageUrl.searchParams.set("model", "flux");
  imageUrl.searchParams.set("width", "768");
  imageUrl.searchParams.set("height", "768");
  imageUrl.searchParams.set("nologo", "true");
  imageUrl.searchParams.set("enhance", "false");

  const response = await fetch(imageUrl, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`Pollinations returned HTTP ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Pollinations returned an empty image");
  const responseType = response.headers.get("content-type")?.split(";")[0].trim();
  const mimeType = responseType?.startsWith("image/") ? responseType : "image/jpeg";
  const encoded = bytes.toString("base64");

  return {
    model: "pollinations:flux-fallback",
    mimeType,
    data: `data:${mimeType};base64,${encoded}`,
    bytes,
  };
}

export async function generateImage(prompt: string): Promise<GeneratedImage> {
  const stabilityKey = apiKey("STABLE_DIFFUSION_API_KEY");
  const geminiKey = apiKey("GEMINI_IMAGE_API_KEY") || apiKey("GEMINI_API_KEY");
  const failures: string[] = [];

  if (stabilityKey) {
    try {
      return await generateStabilityImage(prompt, stabilityKey);
    } catch (error) {
      failures.push(`Stability: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }
  if (geminiKey) {
    try {
      return await generateGeminiImage(prompt, geminiKey);
    } catch (error) {
      failures.push(`Gemini: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  try {
    return await generatePollinationsImage(prompt);
  } catch (error) {
    failures.push(`Fallback image provider: ${error instanceof Error ? error.message : "request failed"}`);
  }

  throw new Error(failures.join(" · ") || "All image providers failed");
}