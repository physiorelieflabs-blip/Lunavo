const SAFE_RASTER_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export function isSafeRasterImageType(contentType: string): boolean {
  return SAFE_RASTER_IMAGE_TYPES.has(contentType.split(";", 1)[0]!.trim().toLowerCase());
}

export function matchesRasterImageSignature(contentType: string, body: Buffer): boolean {
  const type = contentType.split(";", 1)[0]!.trim().toLowerCase();
  if (type === "image/jpeg") return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (type === "image/png") return body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (type === "image/webp") return body.length >= 12 && body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP";
  if (type === "image/gif") return body.length >= 6 && ["GIF87a", "GIF89a"].includes(body.toString("ascii", 0, 6));
  if (type === "image/avif") return body.length >= 12 && body.toString("ascii", 4, 8) === "ftyp" && /^(avif|avis)$/.test(body.toString("ascii", 8, 12));
  return false;
}

export function validateGeneratedRasterImage(
  bytes: Buffer,
  mimeType: string,
  maxBytes = 25 * 1024 * 1024,
): string {
  const normalizedType = mimeType.split(";", 1)[0]!.trim().toLowerCase();
  if (!bytes.length || bytes.length > maxBytes) {
    throw new Error("Self-hosted image endpoint returned an invalid image size");
  }
  if (!isSafeRasterImageType(normalizedType) || !matchesRasterImageSignature(normalizedType, bytes)) {
    throw new Error("Self-hosted image endpoint returned an unsupported or invalid raster image");
  }
  return normalizedType;
}
