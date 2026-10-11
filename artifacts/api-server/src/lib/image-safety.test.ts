import { describe, expect, it } from "vitest";
import { isSafeRasterImageType, matchesRasterImageSignature, validateGeneratedRasterImage } from "./image-safety";

describe("safe raster image handling", () => {
  it.each(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"])(
    "allows passive raster media type %s",
    (type) => expect(isSafeRasterImageType(type)).toBe(true),
  );

  it.each(["image/svg+xml", "text/html", "application/octet-stream", "image/unknown"])(
    "rejects active or unsupported media type %s",
    (type) => expect(isSafeRasterImageType(type)).toBe(false),
  );

  it("validates the declared MIME type against actual JPEG and PNG signatures", () => {
    expect(matchesRasterImageSignature("image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toBe(true);
    expect(matchesRasterImageSignature("image/jpeg", Buffer.from("<html>not an image</html>"))).toBe(false);
    expect(matchesRasterImageSignature("image/png", Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))).toBe(true);
    expect(matchesRasterImageSignature("image/png", Buffer.from("<svg/>"))).toBe(false);
  });

  it("refuses SVG payloads and mislabeled generated images", () => {
    expect(() => validateGeneratedRasterImage(Buffer.from("<svg/>"), "image/svg+xml")).toThrow(/unsupported or invalid raster/);
    expect(() => validateGeneratedRasterImage(Buffer.from("<html/>"), "image/png")).toThrow(/unsupported or invalid raster/);
    expect(() => validateGeneratedRasterImage(Buffer.from([0xff, 0xd8, 0xff, 0xdb]), "image/png")).toThrow(/unsupported or invalid raster/);
  });

  it("normalizes the media type only after successful signature validation", () => {
    expect(validateGeneratedRasterImage(Buffer.from([0xff,0xd8,0xff,0xdb]), "image/jpeg; charset=binary")).toBe("image/jpeg");
    expect(() => validateGeneratedRasterImage(Buffer.alloc(0), "image/jpeg")).toThrow(/invalid image size/);
    expect(() => validateGeneratedRasterImage(Buffer.alloc(8), "image/png", 4)).toThrow(/invalid image size/);
  });

  it("rejects non-public image formats even if they are commonly used as image files", () => {
    expect(isSafeRasterImageType("image/tiff")).toBe(false);
    expect(isSafeRasterImageType("image/bmp")).toBe(false);
  });
});
