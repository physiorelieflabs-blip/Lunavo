import { describe, expect, it } from "vitest";
import { imageResult, readBoundedResponseBody } from "./pollinations";

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


describe("bounded local image response reading", () => {
  it("reads a response whose body stays within the configured limit", async () => {
    const response = new Response(new Uint8Array([1, 2, 3, 4]));
    await expect(readBoundedResponseBody(response, 4)).resolves.toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it("rejects an oversized declared response before consuming it", async () => {
    const response = new Response("12345", { headers: { "content-length": "5" } });
    await expect(readBoundedResponseBody(response, 4)).rejects.toThrow(/exceeds the safe response-size limit/);
  });

  it("rejects chunked responses once streamed bytes exceed the limit", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    });
    const response = new Response(body);
    await expect(readBoundedResponseBody(response, 5)).rejects.toThrow(/exceeds the safe response-size limit/);
  });
});
