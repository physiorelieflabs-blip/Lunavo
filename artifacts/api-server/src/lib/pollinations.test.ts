import { describe, expect, it } from "vitest";
import { imageResult } from "./pollinations";

describe("self-hosted image-generation output validation", () => {
  it("stores only raster images with matching content signatures", () => {
    const result = imageResult(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), "image/png", "local-test");
    expect(result.mimeType).toBe("image/png");
    expect(result.data).toMatch(/^data:image\/png;base64,/);
  });

  it("rejects SVG and fake image content before producing a data URL", () => {
    expect(() => imageResult(Buffer.from("<svg/>"), "image/svg+xml", "local-test")).toThrow(/unsupported or invalid raster/);
    expect(() => imageResult(Buffer.from("<html/>"), "image/png", "local-test")).toThrow(/unsupported or invalid raster/);
  });

  it("rejects empty and oversized image bytes", () => {
    expect(() => imageResult(Buffer.alloc(0), "image/png", "local-test")).toThrow(/invalid image size/);
    expect(() => imageResult(Buffer.alloc(25 * 1024 * 1024 + 1), "image/png", "local-test")).toThrow(/invalid image size/);
  });
});
