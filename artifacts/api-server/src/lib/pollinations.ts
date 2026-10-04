type GeneratedImage = {
  model: string;
  mimeType: string;
  data: string;
  bytes: Buffer;
};

function imageConfig(): string {
  return (
    process.env.LUNAVO_LOCAL_IMAGE_URL?.trim() ||
    "http://127.0.0.1:7860/sdapi/v1/txt2img"
  ).replace(/\/$/, "");
}

export async function generateImage(prompt: string): Promise<GeneratedImage> {
  const endpoint = imageConfig();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: prompt.slice(0, 12_000),
      negative_prompt:
        "watermark, fake logo, distorted text, malformed hands, duplicate objects, low quality",
      width: 1024,
      height: 1024,
      steps: 32,
      cfg_scale: 7,
      batch_size: 1,
    }),
    signal: AbortSignal.timeout(180_000),
  });

  const contentType =
    response.headers.get("content-type")?.split(";")[0].trim() || "";

  if (!response.ok) {
    const message = (await response.text().catch(() => "")).slice(0, 500);
    throw new Error(
      message || `Self-hosted image service returned HTTP ${response.status}`,
    );
  }

  if (contentType.startsWith("image/")) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) {
      throw new Error("Self-hosted image service returned an empty image");
    }
    const encoded = bytes.toString("base64");
    return {
      model: "self-hosted:stable-diffusion",
      mimeType: contentType,
      data: `data:${contentType};base64,${encoded}`,
      bytes,
    };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    images?: unknown[];
  };
  const encoded =
    typeof payload.images?.[0] === "string" ? payload.images[0] : "";
  if (!encoded) {
    throw new Error("Self-hosted image service returned no image data");
  }
  const normalized = encoded.includes(",")
    ? encoded.slice(encoded.indexOf(",") + 1)
    : encoded;
  const bytes = Buffer.from(normalized, "base64");
  if (!bytes.length || bytes.length > 25 * 1024 * 1024) {
    throw new Error(
      "Self-hosted generated image is empty or exceeds the 25 MB limit",
    );
  }
  return {
    model: "self-hosted:stable-diffusion",
    mimeType: "image/png",
    data: `data:image/png;base64,${normalized}`,
    bytes,
  };
}
