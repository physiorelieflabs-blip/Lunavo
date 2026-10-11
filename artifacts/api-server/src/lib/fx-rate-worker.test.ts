import { describe, expect, it } from "vitest";
import { readBoundedFxResponse } from "./fx-rate-worker";

describe("bounded official FX response reads", () => {
  it("reads a small official response", async () => {
    await expect(readBoundedFxResponse(new Response("<rate>1.2</rate>"), 64, 64)).resolves.toBe("<rate>1.2</rate>");
  });

  it("rejects an oversized content-length before consuming the body", async () => {
    const response = new Response("12345", { headers: { "content-length": "5" } });
    await expect(readBoundedFxResponse(response, 4, 4)).rejects.toThrow(/exceeded the byte size limit/);
  });

  it("rejects chunked bodies when streamed bytes exceed the limit", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    });
    await expect(readBoundedFxResponse(new Response(body), 5, 5)).rejects.toThrow(/exceeded the byte size limit/);
  });

  it("enforces the decoded character limit as well as the byte cap", async () => {
    await expect(readBoundedFxResponse(new Response("12345"), 16, 4)).rejects.toThrow(/character size limit/);
  });
});
