const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
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
  const response = await fetch(
    `${GEMINI_API_BASE}/${GEMINI_IMAGE_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{
            text: [
              "Generate exactly one image that follows the user's brief precisely.",
              "Do not substitute the requested subject, color, material, count, composition, or setting.",
              "Do not add words, logos, labels, or watermarks unless the user explicitly requests them.",
              "USER IMAGE BRIEF:",
              prompt,
            ].join("\n"),
          }],
        }],
        generationConfig: {
          responseModalities: ["IMAGE"],
        },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as GeminiImageResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `Gemini returned HTTP ${response.status}`);
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
  if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
    throw new Error(`Gemini returned an unsupported image type: ${mimeType}`);
  }
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