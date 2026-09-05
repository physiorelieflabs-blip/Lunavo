const POLLINATIONS_IMAGE_MODEL = "flux";
const POLLINATIONS_IMAGE_BASE = "https://image.pollinations.ai/prompt";

export async function generatePollinationsImage(prompt: string): Promise<{
  model: string;
  mimeType: string;
  data: string;
  bytes: Buffer;
}> {
  const imageUrl = new URL(`${POLLINATIONS_IMAGE_BASE}/${encodeURIComponent(prompt)}`);
  imageUrl.searchParams.set("model", POLLINATIONS_IMAGE_MODEL);
  imageUrl.searchParams.set("width", "768");
  imageUrl.searchParams.set("height", "768");
  imageUrl.searchParams.set("nologo", "true");

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
    model: `pollinations:${POLLINATIONS_IMAGE_MODEL}`,
    mimeType,
    data: `data:${mimeType};base64,${encoded}`,
    bytes,
  };
}